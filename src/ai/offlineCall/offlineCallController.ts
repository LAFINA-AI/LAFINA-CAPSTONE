/**
 * Offline Call Lafina: a hands-free call that runs entirely on the phone.
 *
 * One speaker at a time (half-duplex). LAFINA speaks with react-native-tts;
 * while she speaks the microphone is closed, so her voice is never heard as
 * the student. Then the microphone listens until the student stops talking
 * (Silero VAD), whisper.cpp writes down the words, and `respond` turns them
 * into a review card, an answer or a save. Stop ends LAFINA's line at once.
 *
 * It reports the same ConversationSnapshot as the online controller, so the
 * call screen, mini bar and app-wide call registry work with either.
 *
 * Nothing here writes planner data: `respond` does, through the same review
 * cards and confirm-before-write rules as every other surface.
 */
import type {
  ConversationController,
  ConversationFailureKind,
  ConversationPersistence,
  ConversationPhase,
  ConversationSnapshot,
  ConversationTurn,
} from '../../cloud/voiceConversation/types';
import type {
  OfflineSpeechCaptureHandle,
  OfflineSpeechCaptureOptions,
} from '../native/speechCapture';
import type {OwnedSpeechOutcome} from '../tts/ttsService';
import {isEchoOfLine, isHallucinatedSpeech} from '../stt/speechGhosts';
import {cleanTranscript, OFFLINE_SILENCE_GOODBYE} from './spokenReplies';

export type OfflineTurnSource = 'voice' | 'typed';

/** LAFINA's answer to one turn: a line, nothing, or a line and hang up. */
/**
 * A line to say. As an object: `hangUp` ends the call after it; `inChat` means
 * the app already wrote it (or its receipt) to Chat, so it is not written twice.
 */
export type OfflineReply =
  | string
  | null
  | {text: string; hangUp?: boolean; inChat?: boolean};

export interface OfflineCallLimits {
  /** The call ends politely after this long. */
  maxDurationMs: number;
  /** Listens in a row that heard nothing before LAFINA hangs up. */
  maxQuietListens: number;
  /** Capture failures in a row before the call stops. */
  maxCaptureErrors: number;
  /** Writing down one utterance may take this long after recording ends. */
  transcribeTimeoutMs: number;
  /** Reading one request (and saving it) may take this long. */
  respondTimeoutMs: number;
  /** A microphone still being released is retried for this long. */
  busyRetryMs: number;
  /** Writing-down timeouts in a row before the call stops. */
  maxTranscribeTimeouts: number;
}

export const DEFAULT_OFFLINE_LIMITS: OfflineCallLimits = {
  maxDurationMs: 20 * 60 * 1000,
  maxQuietListens: 3,
  maxCaptureErrors: 2,
  transcribeTimeoutMs: 25_000,
  respondTimeoutMs: 20_000,
  busyRetryMs: 4_000,
  maxTranscribeTimeouts: 2,
};

/**
 * The pause that ends a spoken turn in the call. Shorter than push-to-talk's
 * 1 s so LAFINA answers sooner; still long enough for a breath mid-sentence.
 */
export const OFFLINE_CALL_END_SILENCE_MS = 700;
/** Audio right after LAFINA stops talking is ignored (her voice in the room). */
export const OFFLINE_CALL_LEAD_IN_IGNORE_MS = 300;

/** Said when whisper heard speech but wrote no words. */
export const NOT_CAUGHT_REPLY =
  "Sorry, I didn't catch that. Please say it again.";
/** Said when writing the words down took too long. */
export const TRANSCRIBE_TIMEOUT_REPLY =
  "Sorry, I couldn't make that out in time. Please say it again.";
/**
 * Said when reading the request took too long. It does not promise that
 * nothing changed: a save the student already asked for may still finish,
 * and its receipt is shown in Chat.
 */
export const RESPOND_TIMEOUT_REPLY =
  'Sorry, that took too long, so I stopped waiting. Check the screen before you say it again.';
/** Said when whisper kept running out of time. */
export const TRANSCRIBE_STUCK_MESSAGE =
  'Offline speech recognition is too slow on this phone right now, so the call ended. Typing in Chat still works.';
/** Our own last recognition still holds the microphone (not another app). */
export const CAPTURE_STUCK_MESSAGE =
  'Speech recognition was still finishing your last words, so the call ended. Call Lafina again to continue.';

/** Lets `respond` know whether its turn is still the one being answered. */
export interface OfflineTurnContext {
  isCurrent: () => boolean;
}

export interface OfflineCallDeps {
  /** The student's words in, LAFINA's line out (null: say nothing). */
  respond: (
    text: string,
    source: OfflineTurnSource,
    turn: OfflineTurnContext,
  ) => Promise<OfflineReply>;
  /** LAFINA's first line. */
  greeting?: () => string;
  speech: {
    isAvailable: () => Promise<boolean>;
    ensurePermission: () => Promise<boolean>;
    start: (options: OfflineSpeechCaptureOptions) => OfflineSpeechCaptureHandle;
    cancel: (captureId: string) => Promise<boolean>;
    /** The recognizer heard the start of speech for this capture. */
    onSpeechStarted?: (listener: (captureId: string) => void) => () => void;
    /** Recording ended for this capture; writing the words down starts. */
    onCaptureEnded?: (
      listener: (captureId: string, speechDetected: boolean) => void,
    ) => () => void;
    isBusyError?: (error: unknown) => boolean;
  };
  /** Capture tuning for the call; tests leave it out. */
  capture?: {endSilenceMs?: number; leadInIgnoreMs?: number};
  voice: {
    ready: () => Promise<boolean>;
    speak: (
      text: string,
      admit?: () => boolean,
    ) => {
      token: Promise<number | null>;
      result: Promise<OwnedSpeechOutcome>;
    };
    stop: (token: number) => Promise<boolean>;
  };
  persistence?: ConversationPersistence;
  now?: () => number;
  limits?: Partial<OfflineCallLimits>;
  log?: (line: string) => void;
}

const LIVE = new Set<ConversationPhase>([
  'connecting',
  'listening',
  'thinking',
  'tool_working',
  'speaking',
]);

const MAX_TURNS = 40;

/** The microphone is held by this app's own unfinished recognition, not another app. */
const isOwnCaptureBusy = (error: unknown): boolean =>
  (error as {code?: unknown} | null)?.code === 'CAPTURE_BUSY';

export const OFFLINE_VOICE_NAME = 'Phone voice (offline)';

export const OFFLINE_IDLE_SNAPSHOT: ConversationSnapshot = {
  phase: 'idle',
  connectedAt: null,
  muted: false,
  micCapturing: false,
  level: 0,
  outputLevel: 0,
  toolPhrase: null,
  turns: [],
  notice: null,
  failure: null,
  restartReason: null,
  voiceName: OFFLINE_VOICE_NAME,
  endsAt: null,
  lastTiming: null,
};

export class OfflineCallController implements ConversationController {
  private snapshot: ConversationSnapshot = OFFLINE_IDLE_SNAPSHOT;
  private listeners = new Set<(snapshot: ConversationSnapshot) => void>();
  private generation = 0;
  private capture: OfflineSpeechCaptureHandle | null = null;
  private speechToken: number | null = null;
  private pendingSpeech: object | null = null;
  private releasePromise: Promise<boolean> = Promise.resolve(true);
  private stopRequested = false;
  /** endAfterReply: the call ends after LAFINA's next line has been said. */
  private endAfterLine = false;
  private typed: string[] = [];
  private announcements: {text: string; inChat: boolean}[] = [];
  private wake: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryResolve: (() => void) | null = null;
  private voiceReady = false;
  private turnCounter = 0;
  /** The turn `respond` is answering; a late answer to an older one is dropped. */
  private answering = 0;
  private armTranscribeWatchdog: (() => void) | null = null;
  private startedAt = 0;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private spokenPending: {
    gen: number;
    text: string;
    inChat: boolean;
    committed: boolean;
  } | null = null;
  private disposed = false;
  /** The OS microphone prompt is open; the app is not really leaving. */
  private permissionPending = false;
  /** Stop was pressed while LAFINA was still thinking: her next line is shown, not spoken. */
  private skipNextSpeech = false;
  /** LAFINA's last spoken line, to recognise it coming back through the mic. */
  private lastSpokenLine: string | null = null;
  /** The next capture opens right after LAFINA finished speaking. */
  private justSpoke = false;
  private readonly limits: OfflineCallLimits;
  private readonly now: () => number;

  constructor(private readonly deps: OfflineCallDeps) {
    this.limits = {...DEFAULT_OFFLINE_LIMITS, ...deps.limits};
    this.now = deps.now ?? Date.now;
  }

  getSnapshot = (): ConversationSnapshot => this.snapshot;

  subscribe = (
    listener: (snapshot: ConversationSnapshot) => void,
  ): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  isActive = (): boolean => LIVE.has(this.snapshot.phase);

  /** True while the microphone permission prompt is on screen. */
  isRequestingPermission = (): boolean => this.permissionPending;

  private update(patch: Partial<ConversationSnapshot>): void {
    if (this.disposed) return;
    this.snapshot = {...this.snapshot, ...patch};
    for (const listener of [...this.listeners]) listener(this.snapshot);
  }

  private log(line: string): void {
    this.deps.log?.(`[OfflineCall] ${line}`);
  }

  private current(gen: number): boolean {
    return gen === this.generation && !this.disposed && this.isActive();
  }

  private pushTurn(turn: ConversationTurn): void {
    this.update({turns: [...this.snapshot.turns, turn].slice(-MAX_TURNS)});
  }

  private setTurnStatus(id: string, status: ConversationTurn['status']): void {
    this.update({
      turns: this.snapshot.turns.map(turn =>
        turn.id === id ? {...turn, status} : turn,
      ),
    });
  }

  /** Wakes a loop that waits while muted. */
  private nudge(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  private clearRetryWait(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const resolve = this.retryResolve;
    this.retryResolve = null;
    resolve?.();
  }

  /** Ends the capture in progress so the loop can act on something else. */
  private interruptCapture(): void {
    const capture = this.capture;
    if (capture)
      void this.deps.speech.cancel(capture.captureId).catch(() => false);
  }

  // ── Start ─────────────────────────────────────────────────────────────

  start = async (): Promise<void> => {
    if (this.disposed || this.isActive()) return; // double tap
    const gen = ++this.generation;
    this.typed = [];
    this.announcements = [];
    this.stopRequested = false;
    this.skipNextSpeech = false;
    this.lastSpokenLine = null;
    this.justSpoke = false;
    this.deps.persistence?.onReset?.();
    const startedAt = this.now();
    this.update({
      ...OFFLINE_IDLE_SNAPSHOT,
      phase: 'connecting',
      connectedAt: startedAt,
      muted: false,
    });

    // The voice engine starts now, beside the microphone checks, instead of
    // after them: the greeting is ready sooner. Speaking still waits for
    // every check below.
    const voiceReady = Promise.resolve()
      .then(() => this.deps.voice.ready())
      .catch(() => false);
    // Permission first: the student is asked for the microphone the first
    // time, instead of being told speech recognition is "not ready".
    this.permissionPending = true;
    const micAllowed = await this.deps.speech
      .ensurePermission()
      .catch(() => false)
      .finally(() => {
        this.permissionPending = false;
      });
    if (gen !== this.generation) return;
    if (!micAllowed) {
      this.fail(
        gen,
        'mic_denied',
        'Microphone permission is off. Allow it in Settings to talk to Lafina.',
      );
      return;
    }
    const sttReady = await this.deps.speech.isAvailable().catch(() => false);
    if (gen !== this.generation) return;
    if (!sttReady) {
      this.fail(
        gen,
        'voice_unavailable',
        'Offline speech recognition is not ready on this phone, so the offline call cannot listen. Push-to-talk setup and typing in Chat still work.',
      );
      return;
    }
    this.voiceReady = await voiceReady;
    if (gen !== this.generation) return;

    this.startedAt = this.now();
    this.deadlineTimer = setTimeout(() => {
      if (!this.current(gen)) return;
      this.finish('ended', null);
      this.update({
        notice:
          'The offline call reached its time limit. Start a new call to continue.',
      });
    }, this.limits.maxDurationMs);
    this.update({
      phase: 'listening',
      connectedAt: startedAt,
      endsAt: this.startedAt + this.limits.maxDurationMs,
      notice: this.voiceReady
        ? null
        : 'No offline voice is installed, so Lafina replies in text.',
    });
    this.log('started');
    void this.run(gen);
  };

  // ── The call loop ─────────────────────────────────────────────────────

  private async run(gen: number): Promise<void> {
    const greeting = this.deps.greeting?.();
    if (greeting) await this.say(gen, greeting);
    let quiet = 0;
    let errors = 0;
    let notCaught = 0;
    let unheard = 0;
    while (this.current(gen)) {
      if (this.now() - this.startedAt >= this.limits.maxDurationMs) {
        await this.say(
          gen,
          'We reached the call time limit, so I will hang up now. Call me again anytime.',
        );
        if (this.current(gen)) this.finish('ended', null);
        return;
      }
      const line = this.announcements.shift();
      if (line !== undefined) {
        await this.say(gen, line.text, line.inChat);
        if (this.endAfterLine && this.current(gen)) {
          this.endAfterLine = false;
          this.finish('ended', null);
          return;
        }
        continue;
      }
      const typed = this.typed.shift();
      if (typed !== undefined) {
        quiet = 0;
        await this.turn(gen, typed, 'typed');
        continue;
      }
      if (this.snapshot.muted) {
        await new Promise<void>(resolve => {
          this.wake = resolve;
        });
        continue;
      }
      const heard = await this.listen(gen);
      if (!this.current(gen)) return;
      if (heard.kind === 'interrupted') continue;
      if (heard.kind === 'unheard') {
        quiet = 0;
        unheard += 1;
        if (unheard >= this.limits.maxTranscribeTimeouts) {
          this.fail(gen, 'audio', TRANSCRIBE_STUCK_MESSAGE);
          return;
        }
        await this.say(gen, TRANSCRIBE_TIMEOUT_REPLY);
        continue;
      }
      if (heard.kind === 'error') {
        errors += 1;
        if (errors >= this.limits.maxCaptureErrors) {
          this.fail(
            gen,
            heard.busy ? 'mic_busy' : 'audio',
            heard.ownCapture
              ? CAPTURE_STUCK_MESSAGE
              : heard.busy
              ? 'Another recording is using the microphone. Stop it, then call Lafina again.'
              : 'The microphone stopped working, so the call ended. Try calling again.',
          );
          return;
        }
        continue;
      }
      errors = 0;
      unheard = 0;
      if (!heard.text && heard.speech && notCaught < 2) {
        // Speech was heard but no words came out: say so, never go silent.
        notCaught += 1;
        quiet = 0;
        await this.say(gen, NOT_CAUGHT_REPLY);
        continue;
      }
      if (!heard.text) {
        quiet += 1;
        if (quiet >= this.limits.maxQuietListens) {
          await this.say(gen, OFFLINE_SILENCE_GOODBYE);
          if (this.current(gen)) this.finish('ended', null);
          return;
        }
        continue;
      }
      quiet = 0;
      notCaught = 0;
      await this.turn(gen, heard.text, 'voice');
    }
  }

  private async listen(
    gen: number,
  ): Promise<
    | {kind: 'heard'; text: string; speech: boolean}
    | {kind: 'interrupted'}
    | {kind: 'unheard'}
    | {kind: 'error'; busy: boolean; ownCapture?: boolean}
  > {
    this.update({
      phase: 'listening',
      micCapturing: true,
      level: 0,
      toolPhrase: null,
    });
    let handle: OfflineSpeechCaptureHandle | null = null;
    const retryUntil = this.now() + this.limits.busyRetryMs;
    // Only the capture right after LAFINA spoke skips its first moments.
    const leadIn = this.justSpoke
      ? this.deps.capture?.leadInIgnoreMs
      : undefined;
    const echoLine = this.justSpoke ? this.lastSpokenLine : null;
    this.justSpoke = false;
    while (!handle) {
      try {
        handle = this.deps.speech.start({
          mode: 'automatic',
          bargeIn: false,
          context: 'main_mic',
          ...(this.deps.capture?.endSilenceMs
            ? {endSilenceMs: this.deps.capture.endSilenceMs}
            : {}),
          ...(leadIn ? {leadInIgnoreMs: leadIn} : {}),
        });
      } catch (error) {
        const busy = this.deps.speech.isBusyError?.(error) ?? false;
        // The last capture may still be giving the microphone back.
        if (busy && this.now() < retryUntil && this.current(gen)) {
          await new Promise<void>(resolve => {
            this.retryResolve = resolve;
            this.retryTimer = setTimeout(() => {
              this.retryTimer = null;
              this.retryResolve = null;
              resolve();
            }, 400);
          });
          if (
            !this.current(gen) ||
            this.snapshot.muted ||
            this.typed.length > 0 ||
            this.announcements.length > 0
          )
            return {kind: 'interrupted'};
          continue;
        }
        this.update({micCapturing: false});
        this.log(`capture could not start: ${String(error)}`);
        return {kind: 'error', busy, ownCapture: isOwnCaptureBusy(error)};
      }
    }
    const capture = handle;
    this.capture = capture;
    const openedAt = this.now();
    let endedAt: number | null = null;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const transcribing = new Promise<'timeout'>(resolve => {
      this.armTranscribeWatchdog = () => {
        if (watchdog) return;
        watchdog = setTimeout(
          () => resolve('timeout'),
          this.limits.transcribeTimeoutMs,
        );
      };
    });
    const unsubscribeStart =
      this.deps.speech.onSpeechStarted?.(captureId => {
        if (captureId === capture.captureId && this.current(gen))
          this.update({level: 0.7});
      }) ?? (() => undefined);
    const unsubscribeEnd =
      this.deps.speech.onCaptureEnded?.((captureId, speechDetected) => {
        if (captureId !== capture.captureId || !this.current(gen)) return;
        endedAt = this.now();
        if (!speechDetected) return;
        // Recording is over; whisper is writing the words down.
        this.update({
          phase: 'thinking',
          micCapturing: false,
          level: 0,
          toolPhrase: 'Writing down what you said…',
        });
        this.armTranscribeWatchdog?.();
      }) ?? (() => undefined);
    try {
      const outcome = await Promise.race([capture.result, transcribing]);
      if (!this.current(gen)) return {kind: 'interrupted'};
      this.update({micCapturing: false, level: 0, toolPhrase: null});
      if (outcome === 'timeout') {
        this.log(
          `transcription timed out after ${this.limits.transcribeTimeoutMs}ms`,
        );
        await this.deps.speech.cancel(capture.captureId).catch(() => false);
        return {kind: 'unheard'};
      }
      if (outcome.cancelled) return {kind: 'interrupted'};
      let text = cleanTranscript(outcome.transcript ?? '');
      // Whisper's inventions on noise ("Thank you.") and LAFINA's own last
      // words coming back are not the student: count them as silence, so a
      // cough can never hang up the call or answer a card.
      const ghost =
        !!text &&
        (isHallucinatedSpeech(text, outcome.maxVadProbability) ||
          isEchoOfLine(text, echoLine));
      if (ghost) text = '';
      this.log(
        `heard: speech=${outcome.speechDetected} chars=${text.length} ` +
          `ghost=${ghost} maxVad=${outcome.maxVadProbability ?? 'n/a'} ` +
          `recordMs=${(endedAt ?? this.now()) - openedAt} ` +
          `captureMs=${outcome.captureDurationMs} inferenceMs=${outcome.inferenceDurationMs}`,
      );
      return {
        kind: 'heard',
        text,
        speech: outcome.speechDetected && !ghost,
      };
    } catch (error) {
      if (!this.current(gen)) return {kind: 'interrupted'};
      this.update({micCapturing: false, level: 0, toolPhrase: null});
      this.log(`capture failed: ${String(error)}`);
      return {
        kind: 'error',
        busy: this.deps.speech.isBusyError?.(error) ?? false,
        ownCapture: isOwnCaptureBusy(error),
      };
    } finally {
      if (watchdog) clearTimeout(watchdog);
      unsubscribeStart();
      unsubscribeEnd();
      if (this.capture === capture) {
        this.armTranscribeWatchdog = null;
        this.capture = null;
      }
    }
  }

  private async turn(
    gen: number,
    text: string,
    source: OfflineTurnSource,
  ): Promise<void> {
    this.pushTurn({
      id: `offline-user-${++this.turnCounter}`,
      role: 'user',
      text,
      status: 'final',
    });
    try {
      this.deps.persistence?.userTurn(text);
    } catch {
      // History is best-effort; the call goes on.
    }
    this.update({phase: 'thinking', toolPhrase: null});
    // A Stop from an earlier turn does not silence this one.
    this.skipNextSpeech = false;
    const askedAt = this.now();
    const turnId = ++this.answering;
    const isCurrent = () => this.current(gen) && this.answering === turnId;
    let reply: OfflineReply;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      reply = await Promise.race([
        this.deps.respond(text, source, {isCurrent}),
        new Promise<OfflineReply>(resolve => {
          timer = setTimeout(() => {
            // Retire this turn first, so its late answer is dropped.
            this.answering += 1;
            this.log(
              `respond timed out after ${this.limits.respondTimeoutMs}ms`,
            );
            resolve(RESPOND_TIMEOUT_REPLY);
          }, this.limits.respondTimeoutMs);
        }),
      ]);
    } catch (error) {
      this.log(`respond failed: ${String(error)}`);
      reply = 'Sorry, something went wrong on my side. Nothing was changed.';
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!this.current(gen)) return;
    this.log(`respond took ${this.now() - askedAt}ms`);
    this.update({lastTiming: {toFirstText: this.now() - askedAt}});
    const line = typeof reply === 'string' ? reply : reply?.text ?? null;
    const inChat = typeof reply === 'object' && reply?.inChat === true;
    if (line?.trim()) await this.say(gen, line.trim(), inChat);
    else this.update({phase: 'listening'});
    this.skipNextSpeech = false;
    const hangUp =
      (typeof reply === 'object' && reply?.hangUp === true) ||
      this.endAfterLine;
    if (hangUp && this.current(gen)) {
      this.endAfterLine = false;
      this.finish('ended', null);
    }
  }

  /** Shows LAFINA's line, speaks it, and waits until it ends or Stop. */
  private async say(gen: number, text: string, inChat = false): Promise<void> {
    if (!this.current(gen)) return;
    const id = `offline-assistant-${++this.turnCounter}`;
    this.pushTurn({id, role: 'assistant', text, status: 'final'});
    const pending = {gen, text, inChat, committed: false};
    this.spokenPending = pending;
    let heard: 'complete' | 'interrupted' = 'complete';
    if (this.skipNextSpeech) {
      // Stop was pressed while she was thinking: show the line, say nothing.
      this.skipNextSpeech = false;
      heard = 'interrupted';
      this.setTurnStatus(id, 'interrupted');
    } else if (this.voiceReady) {
      this.stopRequested = false;
      this.update({phase: 'speaking', outputLevel: 0.6, micCapturing: false});
      const speech = this.deps.voice.speak(
        text,
        () => this.current(gen) && !this.stopRequested,
      );
      this.pendingSpeech = speech;
      const completed = speech.result.catch(
        () => 'failed' as OwnedSpeechOutcome,
      );
      const token = await speech.token.catch(() => null);
      if (this.pendingSpeech === speech) this.pendingSpeech = null;
      if (!this.current(gen)) {
        if (token !== null) void this.deps.voice.stop(token).catch(() => false);
        return;
      }
      if (token !== null) {
        if (this.stopRequested || !this.current(gen)) {
          void this.deps.voice.stop(token).catch(() => false);
        } else {
          this.speechToken = token;
        }
      }
      const outcome = await completed;
      if (!this.current(gen)) return;
      if (this.speechToken === token) this.speechToken = null;
      if (outcome !== 'failed' && outcome !== 'refused') {
        // Her voice may still be in the room when the microphone opens.
        this.justSpoke = true;
        this.lastSpokenLine = text;
      }
      if (outcome === 'stopped') {
        heard = 'interrupted';
        this.setTurnStatus(id, 'interrupted');
      } else if (outcome === 'failed' && this.current(gen)) {
        this.voiceReady = false;
        this.update({
          notice:
            'The offline voice stopped working, so Lafina replies in text.',
        });
      }
    }
    if (!this.current(gen)) return;
    this.commitSpoken(pending, heard);
    if (this.current(gen)) this.update({phase: 'listening', outputLevel: 0});
  }

  private commitSpoken(
    pending: NonNullable<OfflineCallController['spokenPending']>,
    heard: 'complete' | 'interrupted',
  ): void {
    if (pending.committed) return;
    pending.committed = true;
    try {
      if (!pending.inChat)
        this.deps.persistence?.assistantTurn(pending.text, heard);
    } catch {
      /* Keep manual chat available. */
    }
    if (this.spokenPending === pending) this.spokenPending = null;
  }

  // ── Controls ──────────────────────────────────────────────────────────

  setMuted = (muted: boolean): void => {
    if (this.snapshot.muted === muted) return;
    this.update({muted, ...(muted ? {micCapturing: false, level: 0} : {})});
    if (muted) {
      this.clearRetryWait();
      this.interruptCapture();
    } else {
      this.nudge();
    }
  };

  /**
   * Ends the call after the next line LAFINA says (a goodbye, or "opening
   * Pomodoro"). Keep talking cancels it while the line is still playing.
   */
  endAfterReply = (): void => {
    if (this.isActive()) this.endAfterLine = true;
  };

  cancelEndAfterReply = (): void => {
    this.endAfterLine = false;
  };

  /** Stops LAFINA's line now; the call goes back to listening. */
  stopResponse = (): void => {
    this.stopRequested = true;
    this.endAfterLine = false;
    if (this.capture) {
      this.interruptCapture();
    } else if (this.snapshot.phase === 'thinking') {
      // Pressed while she is still working out the answer: that answer is
      // shown when it comes, not spoken.
      this.skipNextSpeech = true;
    }
    const token = this.speechToken;
    if (token !== null) void this.deps.voice.stop(token).catch(() => false);
  };

  /** A typed turn, handled like a spoken one. */
  sendText = async (text: string): Promise<boolean> => {
    const trimmed = text.trim().slice(0, 1000);
    if (!trimmed || !this.isActive()) return false;
    if (this.typed.length >= 20) this.typed.shift();
    this.typed.push(trimmed);
    this.clearRetryWait();
    this.interruptCapture();
    this.nudge();
    return true;
  };

  /**
   * LAFINA says a line the app started (a save from a tap on the card),
   * as soon as she is not already speaking.
   */
  announce = (text: string, options: {inChat?: boolean} = {}): void => {
    const trimmed = text.trim();
    if (!trimmed || !this.isActive()) return;
    if (this.announcements.length >= 20) this.announcements.shift();
    this.announcements.push({text: trimmed, inChat: options.inChat === true});
    if (this.snapshot.phase === 'listening') {
      this.clearRetryWait();
      this.interruptCapture();
    }
    this.nudge();
  };

  /** No model is listening offline; context has nowhere to go. */
  sendContext = async (_information: string): Promise<boolean> => true;

  private finish(
    phase: 'ended' | 'restart_required' | 'failed',
    restartReason: string | null,
    failure: {kind: ConversationFailureKind; message: string} | null = null,
  ): void {
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    if (this.spokenPending)
      this.commitSpoken(this.spokenPending, 'interrupted');
    this.generation += 1;
    this.answering += 1;
    this.endAfterLine = false;
    this.log(`call ${phase}${failure ? ` (${failure.kind})` : ''}`);
    this.clearRetryWait();
    const capture = this.capture;
    const token = this.speechToken;
    this.speechToken = null;
    this.typed = [];
    this.announcements = [];
    this.nudge();
    this.releasePromise = Promise.all([
      capture
        ? this.deps.speech.cancel(capture.captureId).catch(() => false)
        : Promise.resolve(true),
      token !== null
        ? this.deps.voice.stop(token).catch(() => false)
        : Promise.resolve(true),
    ]).then(results => results.every(result => result !== false));
    this.deps.persistence?.onReset?.();
    this.update({
      phase,
      micCapturing: false,
      level: 0,
      outputLevel: 0,
      toolPhrase: null,
      endsAt: null,
      restartReason,
      failure,
    });
  }

  private fail(
    gen: number,
    kind: ConversationFailureKind,
    message: string,
  ): void {
    if (gen !== this.generation) return;
    this.log(`failed: ${kind}`);
    this.finish('failed', null, {kind, message});
  }

  end = (): void => {
    if (!this.isActive()) return;
    this.finish('ended', null);
  };

  endAndWait = async (): Promise<boolean> => {
    const pendingSpeech = this.pendingSpeech !== null;
    this.end();
    const released = await this.releasePromise.catch(() => false);
    return !pendingSpeech && released;
  };

  stopForSystem = (reason: string): void => {
    if (!this.isActive()) return;
    this.finish('restart_required', reason);
  };

  dispose = (): void => {
    this.end();
    this.disposed = true;
    this.listeners.clear();
  };
}
