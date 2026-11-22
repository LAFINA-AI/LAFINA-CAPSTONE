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
}

export const DEFAULT_OFFLINE_LIMITS: OfflineCallLimits = {
  maxDurationMs: 20 * 60 * 1000,
  maxQuietListens: 3,
  maxCaptureErrors: 2,
  transcribeTimeoutMs: 25_000,
  respondTimeoutMs: 20_000,
  busyRetryMs: 4_000,
};

/** Said when whisper heard speech but wrote no words. */
export const NOT_CAUGHT_REPLY =
  "Sorry, I didn't catch that. Please say it again.";
/** Said when writing the words down took too long. */
export const TRANSCRIBE_TIMEOUT_REPLY =
  "Sorry, I couldn't make that out in time. Please say it again.";
/** Said when reading the request took too long. */
export const RESPOND_TIMEOUT_REPLY =
  'Sorry, that took too long, so I stopped. Nothing was changed. Please say it again.';

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
  voice: {
    ready: () => Promise<boolean>;
    speak: (text: string) => {
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
  private stopRequested = false;
  /** endAfterReply: the call ends after LAFINA's next line has been said. */
  private endAfterLine = false;
  private typed: string[] = [];
  private announcements: {text: string; inChat: boolean}[] = [];
  private wake: (() => void) | null = null;
  private voiceReady = false;
  private turnCounter = 0;
  /** The turn `respond` is answering; a late answer to an older one is dropped. */
  private answering = 0;
  private armTranscribeWatchdog: (() => void) | null = null;
  private startedAt = 0;
  private disposed = false;
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
    const micAllowed = await this.deps.speech
      .ensurePermission()
      .catch(() => false);
    if (gen !== this.generation) return;
    if (!micAllowed) {
      this.fail(
        gen,
        'mic_denied',
        'Microphone permission is off. Allow it in Settings to talk to Lafina.',
      );
      return;
    }
    this.voiceReady = await voiceReady;
    if (gen !== this.generation) return;

    this.startedAt = this.now();
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
        await this.say(gen, TRANSCRIBE_TIMEOUT_REPLY);
        continue;
      }
      if (heard.kind === 'error') {
        errors += 1;
        if (errors >= this.limits.maxCaptureErrors) {
          this.fail(
            gen,
            heard.busy ? 'mic_busy' : 'audio',
            heard.busy
              ? 'Another recording is using the microphone. Stop it, then call Lafina again.'
              : 'The microphone stopped working, so the call ended. Try calling again.',
          );
          return;
        }
        continue;
      }
      errors = 0;
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
    | {kind: 'error'; busy: boolean}
  > {
    this.update({
      phase: 'listening',
      micCapturing: true,
      level: 0,
      toolPhrase: null,
    });
    let handle: OfflineSpeechCaptureHandle | null = null;
    const retryUntil = this.now() + this.limits.busyRetryMs;
    while (!handle) {
      try {
        handle = this.deps.speech.start({
          mode: 'automatic',
          bargeIn: false,
          context: 'main_mic',
        });
      } catch (error) {
        const busy = this.deps.speech.isBusyError?.(error) ?? false;
        // The last capture may still be giving the microphone back.
        if (busy && this.now() < retryUntil && this.current(gen)) {
          await new Promise<void>(resolve => setTimeout(resolve, 400));
          if (!this.current(gen) || this.snapshot.muted)
            return {kind: 'interrupted'};
          continue;
        }
        this.update({micCapturing: false});
        this.log(`capture could not start: ${String(error)}`);
        return {kind: 'error', busy};
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
        void this.deps.speech.cancel(capture.captureId).catch(() => false);
        return {kind: 'unheard'};
      }
      if (outcome.cancelled) return {kind: 'interrupted'};
      const text = cleanTranscript(outcome.transcript ?? '');
      this.log(
        `heard: speech=${outcome.speechDetected} chars=${text.length} ` +
          `recordMs=${(endedAt ?? this.now()) - openedAt} ` +
          `captureMs=${outcome.captureDurationMs} inferenceMs=${outcome.inferenceDurationMs}`,
      );
      return {kind: 'heard', text, speech: outcome.speechDetected};
    } catch (error) {
      if (!this.current(gen)) return {kind: 'interrupted'};
      this.update({micCapturing: false, level: 0, toolPhrase: null});
      this.log(`capture failed: ${String(error)}`);
      return {
        kind: 'error',
        busy: this.deps.speech.isBusyError?.(error) ?? false,
      };
    } finally {
      if (watchdog) clearTimeout(watchdog);
      this.armTranscribeWatchdog = null;
      unsubscribeStart();
      unsubscribeEnd();
      if (this.capture?.captureId === capture.captureId) this.capture = null;
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
    let heard: 'complete' | 'interrupted' = 'complete';
    if (this.voiceReady) {
      this.stopRequested = false;
      this.update({phase: 'speaking', outputLevel: 0.6, micCapturing: false});
      const speech = this.deps.voice.speak(text);
      const token = await speech.token.catch(() => null);
      if (token !== null) {
        this.speechToken = token;
        if (this.stopRequested || !this.current(gen))
          void this.deps.voice.stop(token).catch(() => false);
      }
      const outcome = await speech.result.catch(
        () => 'failed' as OwnedSpeechOutcome,
      );
      this.speechToken = null;
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
    try {
      if (!inChat) this.deps.persistence?.assistantTurn(text, heard);
    } catch {
      // History is best-effort.
    }
    if (this.current(gen)) this.update({phase: 'listening', outputLevel: 0});
  }

  // ── Controls ──────────────────────────────────────────────────────────

  setMuted = (muted: boolean): void => {
    if (this.snapshot.muted === muted) return;
    this.update({muted, ...(muted ? {micCapturing: false, level: 0} : {})});
    if (muted) this.interruptCapture();
    else this.nudge();
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
    const token = this.speechToken;
    if (token !== null) void this.deps.voice.stop(token).catch(() => false);
  };

  /** A typed turn, handled like a spoken one. */
  sendText = async (text: string): Promise<boolean> => {
    const trimmed = text.trim().slice(0, 1000);
    if (!trimmed || !this.isActive()) return false;
    this.typed.push(trimmed);
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
    this.announcements.push({text: trimmed, inChat: options.inChat === true});
    if (this.snapshot.phase === 'listening') this.interruptCapture();
    this.nudge();
  };

  /** No model is listening offline; context has nowhere to go. */
  sendContext = async (_information: string): Promise<boolean> => true;

  private finish(
    phase: 'ended' | 'restart_required' | 'failed',
    restartReason: string | null,
    failure: {kind: ConversationFailureKind; message: string} | null = null,
  ): void {
    this.generation += 1;
    this.answering += 1;
    this.endAfterLine = false;
    this.log(`call ${phase}${failure ? ` (${failure.kind})` : ''}`);
    this.interruptCapture();
    const token = this.speechToken;
    if (token !== null) void this.deps.voice.stop(token).catch(() => false);
    this.speechToken = null;
    this.typed = [];
    this.announcements = [];
    this.nudge();
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
    const capture = this.capture;
    this.end();
    if (capture)
      await this.deps.speech.cancel(capture.captureId).catch(() => false);
    return true;
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
