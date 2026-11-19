import type {
  ApiOutcome,
  ConversationClock,
  ConversationFailure,
  ConversationFailureKind,
  ConversationPersistence,
  ConversationPhase,
  ConversationSnapshot,
  ConversationTurn,
  TransportEvent,
  VoiceConversationApi,
  VoiceTransport,
} from './types';
import {
  DEFAULT_VOICE_PREFERENCES,
  voicePreferenceContext,
  detectConversationalDirective,
  getToolWorkingPhrase,
  sanitizeSpeechText,
  type VoicePersonaPreferences,
} from './personaPolicy';

/**
 * One live voice conversation at a time, for one signed-in account.
 *
 * Ownership rules (see ADR-030):
 * - `start` is the only way the microphone opens, and only after every gate
 *   passes in order: native support, signed in, Online Mode, consent,
 *   internet, microphone permission, server capability, server session.
 *   Nothing reaches the network before the local gates pass.
 * - Every start gets a new generation. `end`, `stopForSystem` and `dispose`
 *   bump it, so a late answer, event or timer from an older start is ignored
 *   and can never reopen capture or start audio.
 * - The session is never restarted by itself: anything other than the
 *   student ending it (background, call, network, focus loss) leaves
 *   `restart_required`, and only a new tap starts again.
 * - Finished turns are persisted once each. An answer the student did not
 *   hear to the end is saved as interrupted.
 */

export interface VoiceConversationGates {
  isForeground?(): boolean;
  isGuest(): boolean;
  isSignedInOwner(): boolean;
  isOnlineMode(): boolean;
  isOnline(): Promise<boolean>;
  hasConsent(): boolean;
  ensureMicPermission(): Promise<boolean>;
}

export interface VoiceConversationLimits {
  /** Signed URL → open socket with audio running. */
  connectTimeoutMs: number;
  /** Final user words → first answer text before LAFINA explains the delay. */
  thinkingTimeoutMs: number;
  /** No words from the student for this long ends the conversation. */
  inactivityMs: number;
  /** After an interruption, how long a trimmed correction may still arrive. */
  correctionWaitMs: number;
  /** Turns kept on screen (all finished turns are saved to Chat). */
  maxVisibleTurns: number;
  maxTypedChars: number;
}

const humanizeProviderError = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (
    /custom_llm|generation\s*failed|elevenlabs|upstream|bad\s*gateway|502|503|504|econnreset|socket/i.test(
      trimmed,
    )
  ) {
    return 'I hit a temporary connection issue answering that. Please try again.';
  }
  return trimmed;
};

export const DEFAULT_LIMITS: VoiceConversationLimits = {
  connectTimeoutMs: 20_000,
  thinkingTimeoutMs: 25_000,
  inactivityMs: 120_000,
  correctionWaitMs: 800,
  maxVisibleTurns: 60,
  maxTypedChars: 1000,
};

export interface VoiceConversationDeps {
  gates: VoiceConversationGates;
  /** The saved online voice, null for the server default. Throws when unreadable. */
  getVoice(): {id: string; name: string} | null;
  useHandbook(): boolean;
  getStudentContext?(): string;
  api: VoiceConversationApi;
  transport: VoiceTransport;
  clock?: ConversationClock;
  persistence?: ConversationPersistence;
  /** A finished user turn, for on-device scheduling review. */
  onFinalUserText?(text: string): void;
  onTurnInterrupted?(): void;
  onAgentText?(text: string): void;
  suppressAgentResponse?(): boolean;
  appOwnedAudio?: boolean;
  onClientTool?(
    name: string,
    parameters: Record<string, unknown>,
    isCurrent: () => boolean,
  ): Promise<string>;
  allowLocalTestServer?: boolean;
  limits?: Partial<VoiceConversationLimits>;
  /** Timing and lifecycle lines only; never transcripts, URLs or grants. */
  log?(line: string): void;
  newRequestId?(): string;
}

const ACTIVE: ReadonlySet<ConversationPhase> = new Set([
  'connecting',
  'listening',
  'thinking',
  'tool_working',
  'speaking',
]);

/** Text with at least one letter or digit (any script); anything else is noise. */
const MEANINGFUL = /[0-9A-Za-zÀ-ɏͰ-῿぀-￯]/;
/** Quiet playback this long after a complete answer means it was heard to the end. */
const PLAYBACK_SETTLE_MS = 1200;
/** End this long before the server's limit; its clock starts at socket open. */
const LIMIT_EARLY_MS = 5000;
/** A remote close this close to the limit is the limit, not a dropped call. */
const LIMIT_CLOSE_WINDOW_MS = 15_000;
const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const FAILURE_MESSAGES: Record<ConversationFailureKind, string> = {
  signin_required:
    'Sign in to Call Lafina. Offline push-to-talk, typing and your schedule keep working.',
  online_mode_required:
    'Call Lafina needs Online Mode. Turn it on to start; nothing is sent until you tap Start.',
  offline:
    'Connect to the internet to Call Lafina. Offline push-to-talk still works.',
  consent_required:
    'Review how Call Lafina uses your microphone, then tap Start.',
  mic_denied:
    'LAFINA needs microphone access for Call Lafina. Allow it in Settings and try again.',
  mic_busy:
    'The microphone is in use (a recording or push-to-talk). Finish it, then start the call again.',
  not_configured:
    'Call Lafina is not available on the server yet. Text chat and offline voice still work.',
  voice_unavailable:
    'Your saved online voice is no longer available. Choose another voice in Profile.',
  limit_reached:
    'You reached the Call Lafina limit for now. Text chat and offline voice still work.',
  provider:
    'Call Lafina is unavailable right now. Try again later, or use text chat.',
  connect_failed:
    'The call could not connect. Check your internet and try again.',
  audio:
    'The microphone or speaker could not start. Close other apps using audio and try again.',
};

const ownTimers = (clock: ConversationClock) => {
  const handles = new Map<string, unknown>();
  return {
    set(name: string, ms: number, fn: () => void) {
      const previous = handles.get(name);
      if (previous !== undefined) clock.clearTimeout(previous);
      handles.set(
        name,
        clock.setTimeout(() => {
          handles.delete(name);
          fn();
        }, ms),
      );
    },
    clear(name: string) {
      const handle = handles.get(name);
      if (handle !== undefined) clock.clearTimeout(handle);
      handles.delete(name);
    },
    clearAll() {
      for (const handle of handles.values()) clock.clearTimeout(handle);
      handles.clear();
    },
  };
};

interface LiveSession {
  key: string;
  sessionId: string;
  conversationId: string | null;
  unsubscribe: () => void;
}

interface PendingAnswer {
  turnId: string;
  text: string;
  audioStarted: boolean;
  interrupted: boolean;
  /** The full answer text is known (`agent_response` or `agent_response_complete`). */
  complete: boolean;
  committed: boolean;
}

const systemClock: ConversationClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const randomId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The answered reminder, as start-of-call context for the agent. It travels
 * with the student summary in the session's initiation (`student_context`),
 * which LAFINA's server gives DeepSeek as data. A mid-call contextual update
 * is not used: the server keeps only the student's and LAFINA's own turns, so
 * the reminder would be lost. The app already read the reminder aloud, so the
 * agent is told not to announce it again (audit finding 12). No chat turn is
 * created.
 */
export const reminderCallContext = (task: string): string => {
  const reminder = task.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!reminder) return '';
  return `Reminder call: the student just answered a reminder call about "${reminder}". The app already read this reminder aloud, so do not announce or repeat it. Wait for the student to speak, and help with it only if they ask (for example to snooze, reschedule or plan around it). The app itself ends the call when the student says "acknowledge", "got it" or "snooze", or taps a button; you cannot acknowledge it, so never say you did. To snooze for a time the student names, call snooze_reminder. A planner change appears as a card only when an app update says a card is shown; never say a card is on screen otherwise.`;
};

export class VoiceConversationController {
  private readonly deps: VoiceConversationDeps;
  private readonly clock: ConversationClock;
  private readonly limits: VoiceConversationLimits;
  private readonly timers: ReturnType<typeof ownTimers>;
  private readonly listeners = new Set<
    (snapshot: ConversationSnapshot) => void
  >();
  private snapshot: ConversationSnapshot = {
    phase: 'idle',
    muted: false,
    micCapturing: false,
    level: 0,
    outputLevel: 0,
    toolPhrase: null,
    turns: [],
    notice: null,
    failure: null,
    restartReason: null,
    voiceName: null,
    endsAt: null,
    lastTiming: null,
  };
  private generation = 0;
  private permissionPending = false;
  isRequestingPermission = (): boolean => this.permissionPending;
  /** Invalidates work within a live call when the student takes another turn. */
  private turnGeneration = 0;
  private abort: AbortController | null = null;
  private live: LiveSession | null = null;
  private seen = new Set<string>();
  private provisionalUserId: string | null = null;
  private pending: PendingAnswer | null = null;
  private typedEcho: {text: string; at: number} | null = null;
  private userFinalAt: number | null = null;
  private firstTextAt: number | null = null;
  private firstAudioAt: number | null = null;
  private silenceRequestedAt: number | null = null;
  private turnCounter = 0;
  private speechPaused = false;
  private muteQueue: Promise<boolean> = Promise.resolve(true);

  private queueMute(live: LiveSession, muted: boolean): Promise<boolean> {
    const operation = this.muteQueue.then(() =>
      this.live === live
        ? this.deps.transport.setMuted(live.key, muted).catch(() => false)
        : false,
    );
    this.muteQueue = operation.catch(() => false);
    return operation;
  }
  private disposed = false;
  private waitingForStudent = false;
  /** A student turn is waiting for its answer to finish playing. */
  private studentSpokeSinceAnswer = false;
  private limitReason: string | null = null;
  private transportEnding: Promise<boolean> = Promise.resolve(true);
  private personaPreferences: VoicePersonaPreferences = {
    ...DEFAULT_VOICE_PREFERENCES,
  };

  getPreferences = (): VoicePersonaPreferences => ({
    ...this.personaPreferences,
  });

  setPreferences = (prefs: Partial<VoicePersonaPreferences>): void => {
    this.personaPreferences = {...this.personaPreferences, ...prefs};
    if (this.live)
      void this.sendContext(voicePreferenceContext(this.personaPreferences));
  };

  constructor(deps: VoiceConversationDeps) {
    this.deps = deps;
    this.clock = deps.clock ?? systemClock;
    this.limits = {...DEFAULT_LIMITS, ...deps.limits};
    this.timers = ownTimers(this.clock);
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

  isActive = (): boolean => ACTIVE.has(this.snapshot.phase);

  private update(patch: Partial<ConversationSnapshot>) {
    if (this.disposed) return;
    this.snapshot = {...this.snapshot, ...patch};
    for (const listener of [...this.listeners]) listener(this.snapshot);
  }

  private log(line: string) {
    this.deps.log?.(`[VoiceConversation] ${line}`);
  }

  // ── Start ─────────────────────────────────────────────────────────────

  start = async (): Promise<void> => {
    if (this.disposed || ACTIVE.has(this.snapshot.phase)) return; // double tap
    const gen = ++this.generation;
    this.waitingForStudent = false;
    this.studentSpokeSinceAnswer = false;
    this.limitReason = null;
    const stale = () => gen !== this.generation || this.disposed;
    this.seen = new Set();
    this.pending = null;
    this.provisionalUserId = null;
    this.userFinalAt =
      this.firstTextAt =
      this.firstAudioAt =
      this.silenceRequestedAt =
        null;
    this.update({
      phase: 'connecting',
      connectedAt: null,
      failure: null,
      notice: null,
      restartReason: null,
      muted: false,
      micCapturing: false,
      level: 0,
      outputLevel: 0,
      turns: [],
      endsAt: null,
      lastTiming: null,
    });

    const {gates, transport, api} = this.deps;
    if (!transport.available())
      return this.fail(
        gen,
        'not_configured',
        'Voice conversation needs the updated LAFINA app on Android.',
      );
    if (gates.isGuest() || !gates.isSignedInOwner())
      return this.fail(gen, 'signin_required');
    if (!gates.isOnlineMode()) return this.fail(gen, 'online_mode_required');
    if (!gates.hasConsent()) return this.fail(gen, 'consent_required');
    let online = false;
    try {
      online = await gates.isOnline();
    } catch {
      online = false;
    }
    if (stale()) return;
    if (!online) return this.fail(gen, 'offline');
    let permitted = false;
    try {
      this.permissionPending = true;
      permitted = await gates.ensureMicPermission();
    } catch {
      permitted = false;
    } finally {
      this.permissionPending = false;
    }
    if (stale()) return;
    if (!permitted) return this.fail(gen, 'mic_denied');
    if (gates.isForeground?.() === false)
      return this.stopForSystem(
        'The app left the screen before microphone access was ready. Tap Start when you return.',
      );
    let voice: {id: string; name: string} | null;
    try {
      voice = this.deps.getVoice();
    } catch {
      return this.fail(
        gen,
        'voice_unavailable',
        'Your saved online voice could not be read. Choose a voice again in Profile.',
      );
    }
    this.update({
      voiceName: voice?.name ?? 'Server default voice',
    });

    const controller = new AbortController();
    this.abort = controller;
    const capabilities = await api
      .capabilities(controller.signal)
      .catch(() => null);
    if (stale()) return;
    if (!capabilities) return this.fail(gen, 'connect_failed');
    if (!capabilities.ok) return this.failFromApi(gen, capabilities);
    if (!capabilities.data.enabled) {
      return this.fail(
        gen,
        'not_configured',
        capabilities.data.detail || undefined,
      );
    }
    // The student may have switched mode or account meanwhile.
    if (!gates.isOnlineMode()) return this.fail(gen, 'online_mode_required');
    if (!gates.isSignedInOwner()) return this.fail(gen, 'signin_required');

    const session = await api
      .createSession(
        {
          requestId: this.deps.newRequestId?.() ?? randomId(),
          voiceId: voice?.id ?? null,
          useHandbook: this.deps.useHandbook(),
        },
        controller.signal,
      )
      .catch(() => null);
    if (stale()) {
      // Ended while the server was creating it: close it there too.
      if (session?.ok)
        void api.end(session.data.sessionId, null).catch(() => undefined);
      return;
    }
    if (!session) return this.fail(gen, 'connect_failed');
    if (!session.ok) return this.failFromApi(gen, session);
    this.abort = null;
    if (gates.isForeground?.() === false) {
      void api.end(session.data.sessionId, null).catch(() => undefined);
      return this.stopForSystem(
        'The app left the screen before audio started.',
      );
    }

    const key = `vc-${gen}-${randomId()}`;
    const live: LiveSession = {
      key,
      sessionId: session.data.sessionId,
      conversationId: null,
      unsubscribe: () => undefined,
    };
    live.unsubscribe = transport.subscribe(key, event =>
      this.onEvent(gen, event),
    );
    this.live = live;
    // Built here, handed to native once, never stored or logged.
    const studentContext = this.deps.getStudentContext?.() ?? '';
    const initiation = JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {tts: {voice_id: session.data.voiceId}},
      dynamic_variables: {
        lafina_voice_grant: session.data.grant,
        ...(studentContext ? {student_context: studentContext} : {}),
      },
      custom_llm_extra_body: {
        lafina_voice_grant: session.data.grant,
        ...(studentContext ? {student_context: studentContext} : {}),
      },
    });
    let timedOut = false;
    try {
      await new Promise<void>((resolve, reject) => {
        this.timers.set('connect', this.limits.connectTimeoutMs, () => {
          timedOut = true;
          reject(Object.assign(new Error('timeout'), {code: 'TIMEOUT'}));
        });
        transport
          .start({
            sessionKey: key,
            url: session.data.signedUrl,
            initiation,
            allowLocalTestServer: this.deps.allowLocalTestServer === true,
            appOwnedAudio: this.deps.appOwnedAudio === true,
          })
          .then(resolve, reject);
      });
    } catch (error) {
      this.timers.clear('connect');
      if (stale()) return;
      if (this.snapshot.phase === 'failed') return;
      const code = (error as {code?: unknown})?.code;
      this.log(
        `start failed (${typeof code === 'string' ? code : 'unknown'}${
          timedOut ? ', timeout' : ''
        })`,
      );
      if (code === 'MIC_IN_USE' || code === 'SESSION_BUSY')
        return this.fail(gen, 'mic_busy');
      if (code === 'PERMISSION_DENIED') return this.fail(gen, 'mic_denied');
      if (code === 'AUDIO_FOCUS_DENIED')
        return this.fail(
          gen,
          'audio',
          'Another app or a call is using audio right now. Try again when it ends.',
        );
      return this.fail(gen, 'connect_failed');
    }
    this.timers.clear('connect');
    if (stale()) return;
    const endsAt = this.clock.now() + session.data.maxDurationSeconds * 1000;
    this.update({
      phase: 'listening',
      connectedAt: this.clock.now(),
      voiceName: voice?.name ?? 'Server default voice',
      endsAt,
    });
    if (
      this.personaPreferences.language !== 'en' ||
      this.personaPreferences.pacing !== 'normal' ||
      this.personaPreferences.verbosity !== 'brief'
    ) {
      void this.sendContext(voicePreferenceContext(this.personaPreferences));
    }
    this.log('connected');
    this.limitReason = `The conversation reached its ${Math.round(
      session.data.maxDurationSeconds / 60,
    )}-minute limit. Start a new one to keep talking.`;
    // ElevenLabs starts its own clock when the socket opens, before audio is
    // ready here, so end a little early and say why, instead of being cut off
    // by the server and showing "connection closed".
    const limitMs = session.data.maxDurationSeconds * 1000;
    this.timers.set(
      'limit',
      Math.max(limitMs / 2, limitMs - LIMIT_EARLY_MS),
      () => {
        if (gen === this.generation && this.limitReason)
          this.stopForSystem(this.limitReason);
      },
    );
    this.studentSpokeSinceAnswer = false;
    this.resetInactivity(gen);
  };

  private failFromApi(
    gen: number,
    outcome: Extract<ApiOutcome<unknown>, {ok: false}>,
  ) {
    switch (outcome.status) {
      case 'auth_required':
        return this.fail(
          gen,
          'signin_required',
          'Your sign-in has ended. Sign in again in Profile to Call Lafina.',
        );
      case 'account_disabled':
        return this.fail(
          gen,
          'signin_required',
          'This account cannot use online features.',
        );
      case 'offline':
        return this.fail(gen, 'offline');
      case 'rate_limited':
        return this.fail(gen, 'limit_reached', outcome.message);
      case 'validation_error':
        return outcome.httpStatus === 422
          ? this.fail(gen, 'voice_unavailable', outcome.message)
          : this.fail(gen, 'provider', outcome.message);
      default:
        return this.fail(
          gen,
          outcome.httpStatus === 503 ? 'not_configured' : 'provider',
          outcome.message,
        );
    }
  }

  private fail(gen: number, kind: ConversationFailureKind, message?: string) {
    if (gen !== this.generation || this.disposed) return;
    this.teardown();
    const failure: ConversationFailure = {
      kind,
      message: message || FAILURE_MESSAGES[kind],
    };
    this.update({
      phase: 'failed',
      failure,
      micCapturing: false,
      level: 0,
      outputLevel: 0,
      endsAt: null,
    });
  }

  // ── Controls ──────────────────────────────────────────────────────────

  /** The student ends the conversation. Idempotent. */
  end = (): void => {
    const wasActive = ACTIVE.has(this.snapshot.phase) || this.live !== null;
    this.generation += 1;
    this.teardown();
    if (wasActive)
      this.update({
        phase: 'ended',
        micCapturing: false,
        level: 0,
        outputLevel: 0,
        endsAt: null,
      });
  };

  /** Wait until native audio and microphone resources are released. */
  endAndWait = async (): Promise<boolean> => {
    this.end();
    return this.transportEnding;
  };

  /** Something other than the student stopped it; only a new tap restarts. */
  stopForSystem = (reason: string): void => {
    if (!ACTIVE.has(this.snapshot.phase) && this.live === null) return;
    this.generation += 1;
    this.teardown();
    this.log('stopped by the system');
    this.update({
      phase: 'restart_required',
      restartReason: reason,
      micCapturing: false,
      level: 0,
      outputLevel: 0,
      endsAt: null,
    });
  };

  dispose = (): void => {
    this.generation += 1;
    this.teardown();
    this.disposed = true;
    this.listeners.clear();
  };

  setMuted = async (muted: boolean): Promise<void> => {
    const live = this.live;
    if (!live || this.snapshot.muted === muted) return;
    if (this.speechPaused) {
      this.update({muted, level: 0});
      return;
    }
    const gen = this.generation;
    const ok = await this.queueMute(live, muted);
    if (gen !== this.generation) return;
    if (ok) {
      this.update({muted, level: muted ? 0 : this.snapshot.level});
      if (!muted) this.resetInactivity(gen);
    } else {
      this.update({
        notice: muted
          ? 'The microphone could not be muted. End the call to stop capture.'
          : 'The microphone could not turn back on. End the conversation and start again.',
      });
    }
  };

  /** Stop capture while app-owned TTS plays; preserve the student's mute choice. */
  setSpeechPaused = async (paused: boolean): Promise<boolean> => {
    const live = this.live;
    if (!live) return false;
    if (this.speechPaused === paused) return this.muteQueue;
    const gen = this.generation;
    this.speechPaused = paused;
    const ok = await this.queueMute(live, paused || this.snapshot.muted);
    if (gen !== this.generation || this.live !== live) return false;
    if (!ok && paused) this.speechPaused = false;
    return ok;
  };

  /** Stops LAFINA's current answer; the conversation keeps listening. */
  completeLocalTurn = (): void => {
    this.timers.clear('thinking');
    if (this.live && this.snapshot.phase === 'thinking')
      this.update({phase: 'listening'});
  };

  appSpeechStarted = (): void => {
    if (!this.live || !this.pending || this.pending.committed) return;
    this.pending.audioStarted = true;
    this.update({phase: 'speaking'});
  };

  appSpeechFinished = (heard: boolean): void => {
    if (!this.live || !this.pending || this.pending.committed) return;
    if (!heard) this.pending.interrupted = true;
    if (this.snapshot.phase === 'speaking') this.update({phase: 'listening'});
    this.settleIfHeard();
  };

  /** Stops LAFINA's current answer; the conversation keeps listening. */
  stopResponse = (): void => {
    this.turnGeneration += 1;
    this.deps.onTurnInterrupted?.();
    const live = this.live;
    if (!live) return;
    // Measured only when audio is playing; otherwise there is nothing to silence.
    this.silenceRequestedAt =
      this.snapshot.phase === 'speaking' ? this.clock.now() : null;
    void this.deps.transport.stopResponse(live.key).catch(() => false);
    this.timers.clear('thinking');
    this.markInterrupted();
    if (
      this.snapshot.phase === 'speaking' ||
      this.snapshot.phase === 'thinking' ||
      this.snapshot.phase === 'tool_working'
    ) {
      this.update({phase: 'listening', outputLevel: 0});
    } else {
      this.update({outputLevel: 0});
    }
  };

  /** A typed turn while connected (recovery when speech is not recognized). */
  sendText = async (text: string): Promise<boolean> => {
    this.waitingForStudent = false;
    const live = this.live;
    const trimmed = text.trim().slice(0, this.limits.maxTypedChars);
    if (!live || !trimmed || this.snapshot.phase === 'connecting') return false;
    const sent = await this.deps.transport
      .sendMessage(
        live.key,
        JSON.stringify({type: 'user_message', text: trimmed}),
      )
      .catch(() => false);
    if (!sent || this.live !== live) return false;
    this.typedEcho = {text: trimmed, at: this.clock.now()};
    this.acceptUserTurn(trimmed, `typed-${++this.turnCounter}`);
    return true;
  };

  sendContext = async (information: string): Promise<boolean> => {
    const live = this.live;
    const text = information.trim().slice(0, 4000);
    if (!live || !text || this.snapshot.phase === 'connecting') return false;
    const sent = await this.deps.transport
      .sendMessage(live.key, JSON.stringify({type: 'contextual_update', text}))
      .catch(() => false);
    return sent && this.live === live;
  };

  // ── Events ────────────────────────────────────────────────────────────

  private onEvent(gen: number, event: TransportEvent) {
    if (gen !== this.generation || !this.live || this.disposed) return;
    switch (event.kind) {
      case 'mic':
        this.update({
          micCapturing: event.capturing,
          level: event.capturing ? this.snapshot.level : 0,
        });
        return;
      case 'level':
        if (
          !this.snapshot.muted &&
          Math.abs(event.level - this.snapshot.level) > 0.04
        ) {
          this.update({level: event.level});
        }
        return;
      case 'output_level':
        if (
          this.snapshot.phase === 'speaking' &&
          Math.abs(event.level - this.snapshot.outputLevel) > 0.04
        ) {
          this.update({outputLevel: event.level});
        } else if (
          this.snapshot.phase !== 'speaking' &&
          this.snapshot.outputLevel > 0
        ) {
          this.update({outputLevel: 0});
        }
        return;
      case 'playback':
        return this.onPlayback(event.speaking);
      case 'message':
        return this.onMessage(gen, event.data);
      case 'closed': {
        const live = this.live;
        const sessionId = live?.sessionId;
        const detail = event.reason ? `: ${event.reason}` : '';
        this.log(`connection closed (code=${event.code}${detail})`);
        const endsAt = this.snapshot.endsAt;
        if (
          this.limitReason &&
          typeof endsAt === 'number' &&
          this.clock.now() >= endsAt - LIMIT_CLOSE_WINDOW_MS
        ) {
          // The server's time limit, not a broken connection.
          this.stopForSystem(this.limitReason);
          return;
        }
        this.stopForSystem(
          'The conversation connection closed. Start again when you are ready.',
        );
        const postStopGen = this.generation;
        if (event.reason && !/network/i.test(event.reason)) {
          this.update({notice: humanizeProviderError(event.reason)});
        }
        if (sessionId) {
          void this.checkServerFailureReason(postStopGen, sessionId);
        }
        return;
      }
      case 'backgrounded':
        return this.stopForSystem(
          'The conversation stopped when LAFINA left the screen. Nothing listens in the background.',
        );
      case 'audio_focus_lost':
        return this.stopForSystem(
          'A call, a reminder or another app took the audio, so the conversation stopped.',
        );
      case 'error': {
        const kind: ConversationFailureKind =
          event.code === 'MIC_FAILED' || event.code.startsWith('AUDIO')
            ? 'audio'
            : 'provider';
        return this.fail(
          gen,
          kind,
          event.message ? humanizeProviderError(event.message) : undefined,
        );
      }
      case 'ended':
        if (this.snapshot.phase === 'failed') return;
        return this.stopForSystem('The conversation ended.');
      default:
    }
  }

  private onPlayback(speaking: boolean) {
    if (speaking && this.waitingForStudent) {
      if (this.live)
        void this.deps.transport.stopResponse(this.live.key).catch(() => false);
      return;
    }
    const now = this.clock.now();
    if (speaking) {
      if (this.pending && !this.pending.committed)
        this.pending.audioStarted = true;
      if (this.userFinalAt !== null && this.firstAudioAt === null) {
        this.firstAudioAt = now;
        this.recordTiming({toFirstAudio: now - this.userFinalAt});
      }
      this.timers.clear('thinking');
      // Audio resumed after a short underrun: the answer is not over yet.
      this.timers.clear('settle');
      this.update({phase: 'speaking'});
      return;
    }
    if (this.silenceRequestedAt !== null) {
      this.recordTiming({toSilence: now - this.silenceRequestedAt});
      this.silenceRequestedAt = null;
    }
    if (this.snapshot.phase === 'speaking') {
      this.update({phase: 'listening', outputLevel: 0});
    } else {
      this.update({outputLevel: 0});
    }
    this.settleIfHeard();
    // The student gets the full quiet time after hearing an answer they
    // asked for. LAFINA speaking up on its own after a silence ("I'm still
    // here") does not count as activity, or a silent call would never end.
    if (this.studentSpokeSinceAnswer) this.resetInactivity(this.generation);
  }

  private onMessage(gen: number, data: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    const event = (name: string) =>
      (message[name] && typeof message[name] === 'object'
        ? message[name]
        : {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    const id = (value: unknown) =>
      typeof value === 'number' || typeof value === 'string'
        ? String(value)
        : null;
    switch (message.type) {
      case 'client_tool_call': {
        const payload = event('client_tool_call');
        const toolName = text(payload.tool_name);
        const toolId = text(payload.tool_call_id);
        if (!toolId || toolId.length > 200 || this.seen.has(`tool:${toolId}`))
          return;
        this.seen.add(`tool:${toolId}`);
        const params =
          payload.parameters &&
          typeof payload.parameters === 'object' &&
          !Array.isArray(payload.parameters)
            ? (payload.parameters as Record<string, unknown>)
            : {};
        const live = this.live;
        if (!live) return;
        const turn = this.turnGeneration;
        const toolPhrase = getToolWorkingPhrase(toolName, params.kind);
        if (this.snapshot.phase !== 'speaking') {
          this.update({phase: 'tool_working', toolPhrase});
        }
        void (async () => {
          let answer =
            'This app cannot perform that request in this conversation.';
          let failed = false;
          try {
            if (!this.deps.onClientTool) failed = true;
            else
              answer = await this.deps.onClientTool(
                toolName,
                params,
                () =>
                  gen === this.generation &&
                  turn === this.turnGeneration &&
                  this.live === live &&
                  this.deps.gates.isSignedInOwner() &&
                  this.deps.gates.isOnlineMode() &&
                  this.deps.gates.hasConsent(),
              );
          } catch {
            failed = true;
            answer =
              'The app could not complete that request. Nothing was changed.';
          }
          if (gen !== this.generation || this.live !== live) return;
          if (turn !== this.turnGeneration) {
            answer =
              'Request canceled because the student interrupted or changed their request. Nothing further was changed.';
            failed = true;
          }
          if (this.snapshot.phase === 'tool_working') {
            this.update({phase: 'thinking', toolPhrase: null});
          }
          await this.deps.transport
            .sendMessage(
              live.key,
              JSON.stringify({
                type: 'client_tool_result',
                tool_call_id: toolId,
                result:
                  answer.length <= 5000
                    ? answer
                    : JSON.stringify({
                        partial: true,
                        message:
                          'The result exceeds voice context limits. Ask the student to review the on-screen result or narrow the query.',
                      }),
                is_error: failed,
              }),
            )
            .catch(() => false);
        })();
        return;
      }
      case 'conversation_initiation_metadata': {
        const conversationId = text(
          event('conversation_initiation_metadata_event').conversation_id,
        );
        const live = this.live;
        if (
          live &&
          CONVERSATION_ID.test(conversationId) &&
          !live.conversationId
        ) {
          live.conversationId = conversationId;
          void this.deps.api
            .connected(live.sessionId, conversationId)
            .catch(() => undefined);
        }
        return;
      }
      case 'tentative_user_transcript': {
        const payload = event('tentative_user_transcription_event');
        const fallback = event('tentative_user_transcript_event');
        const words =
          text(payload.user_transcript) ||
          text(fallback.user_transcript) ||
          text(fallback.text);
        if (words.trim()) this.showProvisionalUser(words);
        return;
      }
      case 'user_transcript': {
        const payload = event('user_transcription_event');
        const eventId = id(payload.event_id);
        return this.onFinalUser(text(payload.user_transcript), eventId);
      }
      case 'agent_chat_response_part': {
        const part = event('text_response_part');
        if (part.type === 'delta' && text(part.text))
          this.appendAnswer(text(part.text));
        return;
      }
      case 'agent_response': {
        const payload = event('agent_response_event');
        return this.finalAnswer(
          text(payload.agent_response),
          id(payload.event_id),
        );
      }
      case 'agent_response_correction': {
        const payload = event('agent_response_correction_event');
        return this.correctAnswer(text(payload.corrected_agent_response));
      }
      case 'agent_response_complete':
        if (this.pending && !this.pending.committed) {
          this.pending.complete = true;
          this.settleIfHeard();
        }
        return;
      case 'interruption':
        this.turnGeneration += 1;
        this.deps.onTurnInterrupted?.();
        this.silenceRequestedAt =
          this.snapshot.phase === 'speaking' ? this.clock.now() : null;
        this.markInterrupted();
        if (
          this.snapshot.phase === 'speaking' ||
          this.snapshot.phase === 'thinking' ||
          this.snapshot.phase === 'tool_working'
        ) {
          this.update({phase: 'listening', outputLevel: 0});
        }
        return;
      case 'client_error': {
        const payload = event('client_error');
        const errDetail =
          text(payload.message) ||
          text(
            (message.client_error as Record<string, unknown> | undefined)
              ?.message,
          ) ||
          text(message.message);
        this.log(
          `client_error from voice provider: ${errDetail || 'no details'}`,
        );
        const friendlyDetail = humanizeProviderError(errDetail);
        this.update({
          notice:
            friendlyDetail ||
            'I could not answer that turn. Try saying it again.',
        });
        void this.explainSilence(gen);
        return;
      }
      default:
    }
  }

  private setTurns(turns: ConversationTurn[]) {
    this.update({turns: turns.slice(-this.limits.maxVisibleTurns)});
  }

  private upsertTurn(turn: ConversationTurn) {
    const turns = [...this.snapshot.turns];
    const index = turns.findIndex(t => t.id === turn.id);
    if (index >= 0) turns[index] = turn;
    else turns.push(turn);
    this.setTurns(turns);
  }

  private showProvisionalUser(words: string) {
    if (!this.provisionalUserId)
      this.provisionalUserId = `user-live-${++this.turnCounter}`;
    this.upsertTurn({
      id: this.provisionalUserId,
      role: 'user',
      text: words.trim(),
      status: 'provisional',
    });
    this.resetInactivity(this.generation);
  }

  private onFinalUser(words: string, eventId: string | null) {
    const trimmed = words.trim();
    const key = eventId !== null ? `user:${eventId}` : null;
    if (key && this.seen.has(key)) return; // a duplicate final
    if (key) this.seen.add(key);
    if (!MEANINGFUL.test(trimmed)) {
      // Silence or noise: drop the live line, answer nothing.
      if (this.provisionalUserId) {
        this.setTurns(
          this.snapshot.turns.filter(t => t.id !== this.provisionalUserId),
        );
        this.provisionalUserId = null;
      }
      return;
    }
    const echo = this.typedEcho;
    if (echo && echo.text === trimmed && this.clock.now() - echo.at < 5000) {
      this.typedEcho = null;
      return; // the typed turn, already shown and saved
    }

    const directive = detectConversationalDirective(trimmed);
    if (directive === 'wait') {
      this.waitingForStudent = true;
      this.stopResponse();
      this.acceptUserTurn(trimmed, key ?? `user-${++this.turnCounter}`);
      this.timers.clear('thinking');
      this.update({
        phase: 'listening',
        notice: "I'll wait. Take your time.",
      });
      return;
    }
    this.waitingForStudent = false;
    if (directive === 'brief') {
      this.personaPreferences.verbosity = 'brief';
    } else if (directive === 'detailed') {
      this.personaPreferences.verbosity = 'detailed';
    } else if (directive === 'slow') {
      this.personaPreferences.pacing = 'slow';
    } else if (directive === 'normal') {
      this.personaPreferences.pacing = 'normal';
    }

    this.acceptUserTurn(trimmed, key ?? `user-${++this.turnCounter}`);
  }

  private acceptUserTurn(trimmed: string, turnId: string) {
    this.turnGeneration += 1;
    // A new turn closes the previous answer.
    if (this.pending && !this.pending.committed) {
      if (!this.pending.complete || this.snapshot.phase === 'speaking') {
        this.pending.interrupted = true;
      }
      this.commitAnswer();
    }
    this.studentSpokeSinceAnswer = true;
    const id = this.provisionalUserId ?? turnId;
    this.provisionalUserId = null;
    this.upsertTurn({id, role: 'user', text: trimmed, status: 'final'});
    try {
      this.deps.persistence?.userTurn(trimmed);
    } catch {
      this.update({notice: 'This turn could not be saved to Chat.'});
    }
    this.userFinalAt = this.clock.now();
    this.update({lastTiming: null});
    this.firstTextAt = null;
    this.firstAudioAt = null;
    if (this.snapshot.phase !== 'speaking')
      this.update({phase: 'thinking', notice: null});
    const gen = this.generation;
    this.timers.set('thinking', this.limits.thinkingTimeoutMs, () => {
      if (gen === this.generation) void this.explainSilence(gen);
    });
    this.resetInactivity(gen);
    try {
      this.deps.onFinalUserText?.(trimmed);
    } catch {
      /* the on-device review is optional */
    }
  }

  private ensurePending(): PendingAnswer {
    if (!this.pending || this.pending.committed) {
      this.pending = {
        turnId: `answer-${++this.turnCounter}`,
        text: '',
        audioStarted: false,
        interrupted: false,
        complete: false,
        committed: false,
      };
    }
    return this.pending;
  }

  private noteFirstText() {
    this.timers.clear('thinking');
    if (this.userFinalAt !== null && this.firstTextAt === null) {
      this.firstTextAt = this.clock.now();
      this.recordTiming({toFirstText: this.firstTextAt - this.userFinalAt});
    }
  }

  private appendAnswer(piece: string) {
    if (this.deps.suppressAgentResponse?.()) return;
    const pending = this.ensurePending();
    pending.text += piece;
    this.noteFirstText();
    const sanitized = sanitizeSpeechText(pending.text);
    this.upsertTurn({
      id: pending.turnId,
      role: 'assistant',
      text: sanitized,
      status: 'provisional',
    });
  }

  private finalAnswer(full: string, eventId: string | null) {
    const key = eventId !== null ? `answer:${eventId}` : null;
    if (key && this.seen.has(key)) return;
    if (key) this.seen.add(key);
    const sanitized = sanitizeSpeechText(full);
    if (!sanitized.trim()) return;
    if (this.deps.suppressAgentResponse?.()) {
      this.timers.clear('thinking');
      if (this.snapshot.phase === 'thinking') this.update({phase: 'listening'});
      return;
    }
    const pending = this.ensurePending();
    pending.text = sanitized;
    pending.complete = true;
    this.noteFirstText();
    this.upsertTurn({
      id: pending.turnId,
      role: 'assistant',
      text: sanitized,
      status: pending.interrupted ? 'interrupted' : 'final',
    });
    if (this.deps.appOwnedAudio) this.deps.onAgentText?.(sanitized);
  }

  /**
   * A complete answer whose audio has drained is saved as heard, after a short
   * pause so a brief underrun between audio chunks does not end it early.
   */
  private settleIfHeard() {
    const pending = this.pending;
    if (
      !pending ||
      pending.committed ||
      pending.interrupted ||
      !pending.complete ||
      !pending.audioStarted ||
      this.snapshot.phase === 'speaking'
    ) {
      return;
    }
    const gen = this.generation;
    this.timers.set('settle', PLAYBACK_SETTLE_MS, () => {
      if (
        gen === this.generation &&
        this.pending === pending &&
        this.snapshot.phase !== 'speaking'
      ) {
        this.commitAnswer();
      }
    });
  }

  private correctAnswer(corrected: string) {
    const sanitized = sanitizeSpeechText(corrected);
    if (!sanitized.trim()) return;
    const pending = this.pending;
    if (pending && !pending.committed) {
      pending.text = sanitized;
      pending.interrupted = true;
      this.upsertTurn({
        id: pending.turnId,
        role: 'assistant',
        text: sanitized,
        status: 'interrupted',
      });
      this.commitAnswer();
    }
  }

  private markInterrupted() {
    const pending = this.pending;
    if (!pending || pending.committed) return;
    pending.interrupted = true;
    this.upsertTurn({
      id: pending.turnId,
      role: 'assistant',
      text: pending.text,
      status: 'interrupted',
    });
    // A trimmed correction may follow; save once either way.
    const gen = this.generation;
    this.timers.set('commit', this.limits.correctionWaitMs, () => {
      if (gen === this.generation) this.commitAnswer();
    });
  }

  private commitAnswer() {
    const pending = this.pending;
    if (!pending || pending.committed) return;
    pending.committed = true;
    // The answer the student asked for is over; later speech is LAFINA's own.
    if (
      this.live &&
      this.studentSpokeSinceAnswer &&
      pending.audioStarted &&
      !pending.interrupted
    ) {
      this.studentSpokeSinceAnswer = false;
      this.resetInactivity(this.generation);
    }
    this.timers.clear('commit');
    if (!pending.text.trim()) return;
    const heard = pending.interrupted ? 'interrupted' : 'complete';
    try {
      this.deps.persistence?.assistantTurn(pending.text, heard);
    } catch {
      this.update({notice: 'This answer could not be saved to Chat.'});
    }
  }

  private recordTiming(
    patch: Partial<NonNullable<ConversationSnapshot['lastTiming']>>,
  ) {
    const lastTiming = {...(this.snapshot.lastTiming ?? {}), ...patch};
    this.update({lastTiming});
    this.log(
      `timing ${Object.entries(patch)
        .map(([name, ms]) => `${name}=${ms}ms`)
        .join(' ')}`,
    );
  }

  /** Asks the server once why a turn went unanswered, and says so. */
  private async explainSilence(gen: number) {
    const live = this.live;
    if (!live) return;
    const status = await this.deps.api.status(live.sessionId).catch(() => null);
    if (gen !== this.generation) return;
    const message =
      status?.ok && status.data.lastErrorMessage
        ? humanizeProviderError(status.data.lastErrorMessage)
        : 'LAFINA is taking longer than usual. Keep talking, or end the conversation and use text chat.';
    this.update({
      notice: message,
      phase:
        this.snapshot.phase === 'thinking' ? 'listening' : this.snapshot.phase,
    });
  }

  /** Queries server status after a remote close to surface any recorded server error. */
  private async checkServerFailureReason(gen: number, sessionId: string) {
    try {
      const status = await this.deps.api.status(sessionId).catch(() => null);
      if (
        gen !== this.generation ||
        !status?.ok ||
        !status.data.lastErrorMessage
      ) {
        return;
      }
      this.log(`server failure status recorded: ${status.data.lastErrorCode}`);
      this.update({
        notice: humanizeProviderError(status.data.lastErrorMessage),
      });
    } catch {
      // Retain existing state
    }
  }

  private resetInactivity(gen: number) {
    this.timers.set('inactive', this.limits.inactivityMs, () => {
      if (gen !== this.generation) return;
      if (
        this.snapshot.phase === 'speaking' ||
        this.snapshot.phase === 'thinking' ||
        this.snapshot.phase === 'tool_working'
      ) {
        // Never cut LAFINA off mid-answer; check again after it.
        this.resetInactivity(gen);
        return;
      }
      this.stopForSystem(
        `The conversation ended after ${Math.round(
          this.limits.inactivityMs / 60000,
        )} minutes without speech.`,
      );
    });
  }

  /** Releases everything this controller owns. Safe to call repeatedly. */
  private teardown() {
    this.speechPaused = false;
    this.abort?.abort();
    this.abort = null;
    this.timers.clearAll();
    const live = this.live;
    this.live = null;
    if (live) {
      live.unsubscribe();
      this.transportEnding = this.deps.transport
        .end(live.key)
        .catch(() => false);
      void this.deps.api
        .end(live.sessionId, live.conversationId)
        .catch(() => undefined);
    }
    // Whatever was being said is saved once, marked as not fully heard.
    if (this.pending && !this.pending.committed) {
      if (
        !(
          this.pending.complete &&
          this.snapshot.phase !== 'speaking' &&
          this.pending.audioStarted
        )
      ) {
        this.pending.interrupted = true;
      }
      this.commitAnswer();
    }
    if (this.provisionalUserId) {
      this.snapshot = {
        ...this.snapshot,
        turns: this.snapshot.turns.filter(t => t.id !== this.provisionalUserId),
      };
      this.provisionalUserId = null;
    }
    this.typedEcho = null;
  }
}
