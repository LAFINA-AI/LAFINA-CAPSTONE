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
  VoiceCapabilities,
  VoiceConversationApi,
  VoiceTransport,
} from './types';
import {callRecapTurns} from './callRecap';
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
 * - A call is one or more segments (one server session and socket each).
 *   With `autoReconnect` (ADR-046), a network or server drop keeps the call:
 *   phase `reconnecting`, a few bounded attempts, then the same transcript,
 *   timer and time limit continue on a new segment, and an answer the drop
 *   cut short is asked again once. The student's own actions, leaving the
 *   app, a phone call, sign-out, Online Mode off, consent, auth, quota and
 *   microphone errors never reconnect: they leave `restart_required`, and
 *   only a tap (Start or Continue call) starts again.
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
  /** A dropped call keeps trying to reconnect for this long, then stops. */
  reconnectWindowMs: number;
  /** One reconnect attempt (server session + socket) may take this long. */
  reconnectAttemptTimeoutMs: number;
  /** The internet reported gone this long while connected: reconnect now. */
  networkLostGraceMs: number;
  /** An unanswered student turn this recent is asked again after a reconnect. */
  replayWindowMs: number;
  /** At most this many automatic reconnects in one call. */
  maxReconnects: number;
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
  reconnectWindowMs: 30_000,
  reconnectAttemptTimeoutMs: 10_000,
  networkLostGraceMs: 3_000,
  replayWindowMs: 90_000,
  maxReconnects: 5,
};

/** Spoken by LAFINA after a reconnect (only when the agent accepts an opening line). */
export const RECONNECT_LINE = "Sorry, I lost you for a second. I'm back.";
/** Spoken when the student taps Continue call. */
export const RESUME_LINE = "I'm back. Where were we?";
export const RECONNECTING_NOTICE = 'The connection dropped. Reconnecting…';
export const RECONNECTED_NOTICE = 'Reconnected.';
/** Keeps "connection dropped": the reminder call reads it to offer offline. */
export const RECONNECT_FAILED_REASON =
  'The connection dropped and could not be restored. Tap Continue call when you are ready.';
/** Why an online call stops when the connection drops and cannot reconnect. */
export const NETWORK_DROP_REASON =
  'The internet connection dropped, so the online call stopped.';
const BACKGROUND_REASON =
  'The conversation stopped when LAFINA left the screen. Nothing listens in the background.';
const FOCUS_REASON =
  'A call, a reminder or another app took the audio, so the conversation stopped.';

const RECONNECT_NOTE =
  'Call reconnected: the connection dropped for a moment and this is the same call continuing. What was said so far is in the recent chat below. Do not greet the student or introduce yourself again; continue naturally.';
const RESUME_NOTE =
  "Call continued: the student's previous call stopped (they left the app, another call took the audio, or the connection was lost) and they tapped Continue call. What was said is in the recent chat below. Do not introduce yourself again; continue naturally.";

export type DropKind = 'reconnect' | 'llm' | 'stop';

/**
 * Whether a socket close is worth reconnecting (ADR-046). Network drops and
 * server-side errors are; a normal close (the agent or server ended it),
 * policy, auth and quota closes are not. A failed custom-LLM turn is
 * reconnected once per call (`llm`).
 */
export const classifyDrop = (code: number, reason: string): DropKind => {
  if (/custom_llm|llm_error|generation failed/i.test(reason)) return 'llm';
  if (/network/i.test(reason)) return 'reconnect';
  return [1001, 1006, 1011, 1012, 1013, 1014].includes(code)
    ? 'reconnect'
    : 'stop';
};

/** Retry delays after a failed attempt (the first attempt is immediate). */
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000];
/** While offline during a reconnect, the connection is re-checked this often. */
const OFFLINE_POLL_MS = 1000;
/** Two segments that each drop this soon after connecting: stop retrying. */
const SHORT_SEGMENT_MS = 10_000;
/** Three drops within this window: stop retrying. */
const FLAP_WINDOW_MS = 120_000;
const FLAP_MAX_DROPS = 3;
/** No reconnect when less than this is left before the time limit. */
const MIN_SEGMENT_MS = 20_000;
/** The "Reconnected." line stays this long. */
const RECONNECTED_NOTICE_MS = 3000;

type SegmentKind = 'start' | 'reconnect' | 'resume';
/** ok: connected; retry: a reconnect attempt failed for a passing reason; done: handled. */
type SegmentResult = 'ok' | 'retry' | 'done';
const RETRYABLE: ReadonlySet<ConversationFailureKind> = new Set([
  'offline',
  'connect_failed',
  'provider',
]);

const oneLine = (text: string, max = 300): string => {
  const clean = text.replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
};

export interface VoiceConversationDeps {
  gates: VoiceConversationGates;
  /** The saved online voice, null for the server default. Throws when unreadable. */
  getVoice(): {id: string; name: string} | null;
  useHandbook(): boolean;
  /** True when on-device USTP sources are indexed and ready for `search_ustp_sources` (ADR-047). */
  hasLocalHandbook?(): boolean;
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
  /**
   * The app already spoke the opening (a reminder call reads the reminder
   * aloud), so the agent's fixed first message is neither played nor shown.
   * LAFINA answers normally from the student's first words.
   */
  quietOpening?: boolean;
  /**
   * Waited for after the server session is ready and before the microphone
   * and speaker are opened. A reminder call sets up the session while its
   * greeting is still being read aloud, then starts audio when it ends.
   */
  beforeAudio?(): Promise<void>;
  /**
   * LAFINA's opening line for this call (tone, name, time of day). Used only
   * when the server reports `openingLine`; otherwise the agent's own line.
   */
  getOpeningLine?(): string | null;
  onClientTool?(
    name: string,
    parameters: Record<string, unknown>,
    isCurrent: () => boolean,
  ): Promise<string>;
  allowLocalTestServer?: boolean;
  /**
   * Reconnect a call by itself after a network or server drop (ADR-046).
   * Off unless the production deps turn it on.
   */
  autoReconnect?: boolean;
  /**
   * One short line about what is on the call screen right now (for example
   * a review card waiting for Confirm), told to LAFINA after a reconnect.
   */
  getCallState?(): string | null;
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
  'reconnecting',
]);

/** Text with at least one letter or digit (any script); anything else is noise. */
const MEANINGFUL = /[0-9A-Za-zÀ-ɏͰ-῿぀-￯]/;
/** Quiet playback this long after a complete answer means it was heard to the end. */
const PLAYBACK_SETTLE_MS = 1200;
/** After a goodbye finishes playing, the line closes this much later. */
const END_AFTER_REPLY_TAIL_MS = 400;
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
  /** Which segment of the call (event ids restart with each conversation). */
  segment: number;
  unsubscribe: () => void;
}

/** A native session whose socket dropped; its audio waits for `reconnect`. */
interface ParkedSession {
  key: string;
  unsubscribe: () => void;
  /** False once native released it: the next attempt starts a new session. */
  soft: boolean;
}

/** The student's latest turn, for asking it again after a drop. */
interface LastUserTurn {
  text: string;
  at: number;
  /** A client tool ran for it (a card may be on screen): never asked again. */
  toolRan: boolean;
  /** LAFINA's answer to it was heard to the end. */
  answered: boolean;
  replayed: boolean;
}

interface ReconnectState {
  since: number;
  attempt: number;
  inFlight: boolean;
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
export const reminderCallContext = (
  task: string,
  defaultSnoozeMinutes?: number,
): string => {
  const reminder = task.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!reminder) return '';
  const snoozeDefault =
    typeof defaultSnoozeMinutes === 'number' &&
    Number.isFinite(defaultSnoozeMinutes) &&
    defaultSnoozeMinutes >= 1 &&
    defaultSnoozeMinutes <= 120
      ? Math.round(defaultSnoozeMinutes)
      : null;
  return `Reminder call: the student just answered a reminder call about "${reminder}". The app already read this reminder aloud and told them they can ask for more time or hang up, so do not announce or repeat it. Wait for the student to speak, and help with it only if they ask (for example to snooze, reschedule or plan around it). This call screen has no Acknowledge or Snooze buttons, so never tell the student to tap one. Hanging up counts the reminder as received, and the app also ends the call when the student says "got it", "acknowledge" or "snooze"; you cannot acknowledge it, so never say you did. When the student wants more time ("call me back in 20 minutes", "remind me later"), call snooze_reminder with the minutes they name${
    snoozeDefault
      ? `, or ${snoozeDefault} minutes (their usual snooze) if they name none`
      : ''
  }. In this call "it", "this" and "the reminder" mean this reminder: to move it to another time or day, call prepare_lafina_action once with what the student said. The app reads the student's own words and the tool answer tells you exactly what is on screen; repeat that, and never ask the student to say a change again that they already said. If the answer says a detail is missing, ask only for that detail. Never say a card is on screen unless a tool answer or app update says so.`;
};

/** A capabilities answer fetched by `prepare()` is reused this long. */
const PREPARED_FRESH_MS = 60_000;
/** A `prepare()` request still on its way is waited for only this long. */
const PREPARED_PENDING_MS = 5_000;

export class VoiceConversationController {
  private readonly deps: VoiceConversationDeps;
  /** The server's capabilities, asked for when the call screen opened. */
  private prepared: {
    at: number;
    state: 'pending' | 'ready' | 'failed';
    abort: AbortController;
    result: Promise<ApiOutcome<VoiceCapabilities>>;
  } | null = null;
  private readonly clock: ConversationClock;
  private readonly limits: VoiceConversationLimits;
  private readonly timers: ReturnType<typeof ownTimers>;
  private readonly activeToolTimers = new Set<unknown>();
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
  private desiredMuted = false;
  private activeToolsForTurn = 0;
  /** endAfterReply is waiting for LAFINA's next spoken answer to finish. */
  private endAfter: {sawSpeech: boolean; maxMs: number} | null = null;
  private muteQueue: Promise<boolean> = Promise.resolve(true);

  private queueMute(
    live: LiveSession,
    resolveMuted: () => boolean,
  ): Promise<boolean> {
    const operation = this.muteQueue.then(() =>
      this.live === live
        ? this.deps.transport
            .setMuted(live.key, resolveMuted())
            .catch(() => false)
        : false,
    );
    this.muteQueue = operation.catch(() => false);
    return operation;
  }
  private disposed = false;
  private waitingForStudent = false;
  /** A student turn is waiting for its answer to finish playing. */
  private studentSpokeSinceAnswer = false;
  /** quietOpening: the agent's first message is hidden until the student speaks or types. */
  private openingQuiet = false;
  private limitReason: string | null = null;
  private transportEnding: Promise<boolean> = Promise.resolve(true);
  private transportEndingPending = false;
  // ── Call-scoped (kept across segments) ─────────────────────────────────
  private segment = 0;
  private segmentStartedAt = 0;
  private callCapabilities: VoiceCapabilities | null = null;
  private callVoice: {id: string; name: string} | null = null;
  private parked: ParkedSession | null = null;
  private previousSessionId: string | null = null;
  private lastUserTurn: LastUserTurn | null = null;
  private replayPlan: {text: string; heard: string} | null = null;
  private reconnectState: ReconnectState | null = null;
  private reconnectCount = 0;
  private drops: number[] = [];
  private lastSegmentShort = false;
  private llmRetried = false;
  /** LAFINA's reconnect line is shown and heard but not saved to Chat. */
  private skipPersistText: string | null = null;
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
    const before = this.snapshot.phase;
    this.snapshot = {...this.snapshot, ...patch};
    for (const listener of [...this.listeners]) listener(this.snapshot);
    this.checkEndAfterReply(before);
  }

  /**
   * Ends the call once LAFINA's next spoken answer has finished playing (a
   * goodbye, or "opening Pomodoro"), or after `maxMs` if no answer is heard.
   * A new student turn cancels it.
   */
  endAfterReply = (maxMs = 10_000): void => {
    if (!this.live) {
      this.end();
      return;
    }
    const alreadySpeaking = this.snapshot.phase === 'speaking';
    this.endAfter = {sawSpeech: alreadySpeaking, maxMs};
    const gen = this.generation;
    const capMs = alreadySpeaking ? Math.max(maxMs, 45_000) : maxMs;
    this.timers.set('endAfterReply', capMs, () => {
      if (gen !== this.generation || !this.endAfter) return;
      this.endAfter = null;
      this.log('endAfterReply: no answer heard in time; ending');
      this.end();
    });
  };

  cancelEndAfterReply = (): void => {
    if (!this.endAfter) return;
    this.endAfter = null;
    this.timers.clear('endAfterReply');
  };

  isEndingAfterReply = (): boolean => this.endAfter !== null;

  private checkEndAfterReply(before: ConversationPhase) {
    const waiting = this.endAfter;
    if (!waiting) return;
    const phase = this.snapshot.phase;
    if (phase === 'speaking') {
      if (!waiting.sawSpeech) {
        waiting.sawSpeech = true;
        const gen = this.generation;
        // Once LAFINA starts speaking, widen the safety cap so a longer goodbye
        // finishes instead of being clipped by the no-answer timeout.
        this.timers.set(
          'endAfterReply',
          Math.max(waiting.maxMs, 45_000),
          () => {
            if (gen !== this.generation || !this.endAfter) return;
            this.endAfter = null;
            this.end();
          },
        );
      }
      return;
    }
    if (!waiting.sawSpeech || before !== 'speaking' || phase !== 'listening')
      return;
    // The answer finished. A short pause lets its last syllable leave the
    // speaker before the line closes.
    this.endAfter = null;
    const gen = this.generation;
    this.timers.set('endAfterReply', END_AFTER_REPLY_TAIL_MS, () => {
      if (gen === this.generation) this.end();
    });
  }

  private log(line: string) {
    this.deps.log?.(`[VoiceConversation] ${line}`);
  }

  // ── Start ─────────────────────────────────────────────────────────────

  /** Permission, server and transport waits never preserve revoked consent/access. */
  private checkAdmission(gen: number): boolean {
    const gates = this.deps.gates;
    const failure =
      gates.isGuest() || !gates.isSignedInOwner()
        ? 'signin_required'
        : !gates.isOnlineMode()
        ? 'online_mode_required'
        : !gates.hasConsent()
        ? 'consent_required'
        : null;
    if (failure) {
      this.fail(gen, failure);
      return false;
    }
    return true;
  }

  /**
   * Asks the server what it offers before the student taps Call, so the
   * call starts one round trip sooner (an expired sign-in token is renewed
   * then too). Only for a signed-in student in Online Mode who already
   * consented; no audio, context or student data is sent.
   */
  prepare = (): void => {
    if (this.disposed || ACTIVE.has(this.snapshot.phase)) return;
    const {gates, transport, api} = this.deps;
    try {
      if (
        !transport.available() ||
        gates.isGuest() ||
        !gates.isSignedInOwner() ||
        !gates.isOnlineMode() ||
        !gates.hasConsent()
      )
        return;
    } catch {
      return;
    }
    if (this.takePrepared()) return;
    this.prepared?.abort.abort();
    const abort = new AbortController();
    const entry = {
      at: this.clock.now(),
      state: 'pending' as 'pending' | 'ready' | 'failed',
      abort,
      result: Promise.resolve()
        .then(() => api.capabilities(abort.signal))
        .then(outcome => {
          entry.state =
            outcome?.ok && outcome.data.enabled ? 'ready' : 'failed';
          return outcome;
        }),
    };
    entry.result.catch(() => {
      entry.state = 'failed';
    });
    this.prepared = entry;
  };

  /** A recent, usable `prepare()` answer, or null to ask the server again. */
  private takePrepared(): Promise<ApiOutcome<VoiceCapabilities>> | null {
    const entry = this.prepared;
    if (!entry) return null;
    const age = this.clock.now() - entry.at;
    if (entry.state === 'ready' && age < PREPARED_FRESH_MS) return entry.result;
    if (entry.state === 'pending' && age < PREPARED_PENDING_MS)
      return entry.result;
    return null;
  }

  /**
   * The agent's first message for this call, or null to keep the agent's
   * own line. Only when the server says the agent accepts it: an override
   * the agent does not allow makes it refuse the conversation. A quiet
   * opening (a reminder call) asks for no first message at all.
   */
  private openingLineFor(capabilities: VoiceCapabilities): string | null {
    if (capabilities.openingLine !== true) return null;
    if (this.deps.quietOpening) return '';
    let line: string | null = null;
    try {
      line = this.deps.getOpeningLine?.() ?? null;
    } catch {
      line = null;
    }
    // "{{…}}" is the agent's variable syntax; a name never needs braces.
    const clean = (line ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    return clean && clean.length <= 240 ? clean : null;
  }

  /** Forgets everything one call knew (not the turns on screen). */
  private resetCall() {
    this.waitingForStudent = false;
    this.studentSpokeSinceAnswer = false;
    this.desiredMuted = false;
    this.activeToolsForTurn = 0;
    this.openingQuiet = this.deps.quietOpening === true;
    this.limitReason = null;
    this.seen = new Set();
    this.pending = null;
    this.provisionalUserId = null;
    this.userFinalAt =
      this.firstTextAt =
      this.firstAudioAt =
      this.silenceRequestedAt =
        null;
    this.callCapabilities = null;
    this.callVoice = null;
    this.previousSessionId = null;
    this.lastUserTurn = null;
    this.replayPlan = null;
    this.reconnectState = null;
    this.reconnectCount = 0;
    this.drops = [];
    this.lastSegmentShort = false;
    this.llmRetried = false;
    this.skipPersistText = null;
  }

  start = async (): Promise<void> => {
    if (this.disposed || ACTIVE.has(this.snapshot.phase)) return; // double tap
    const gen = ++this.generation;
    this.resetCall();
    // The screen starts empty, so turn ids may start again (resume keeps them).
    this.segment = 0;
    this.openingQuiet = this.deps.quietOpening === true;
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
      toolPhrase: null,
      turns: [],
      endsAt: null,
      lastTiming: null,
      reconnectAttempt: null,
      reconnects: 0,
      clientUstpTool: false,
    });
    await this.openSegment(gen, 'start');
  };

  /**
   * Continue call (one tap, ADR-046): a new call that keeps the transcript
   * on screen and tells LAFINA the call is continuing, so it does not greet
   * the student again. Every start gate runs again.
   */
  resume = async (): Promise<void> => {
    if (this.disposed || ACTIVE.has(this.snapshot.phase)) return;
    const turns = this.snapshot.turns.filter(t => t.status !== 'provisional');
    const gen = ++this.generation;
    this.resetCall();
    this.openingQuiet = false;
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
      turns,
      endsAt: null,
      lastTiming: null,
      reconnectAttempt: null,
      reconnects: 0,
      clientUstpTool: false,
    });
    await this.openSegment(gen, 'resume');
  };

  /** What LAFINA is told first when a segment continues the call. */
  private segmentNote(kind: SegmentKind): string {
    if (kind === 'start') return '';
    const parts = [kind === 'reconnect' ? RECONNECT_NOTE : RESUME_NOTE];
    const plan = this.replayPlan;
    const turn = this.lastUserTurn;
    if (kind === 'reconnect' && plan) {
      parts.push(
        `The line dropped while you were answering the student's last request ("${oneLine(
          plan.text,
        )}"). It is sent to you again now: answer it in full.${
          plan.heard
            ? ` Your answer had started with: "${oneLine(
                plan.heard,
              )}". Pick up from there instead of repeating all of it.`
            : ''
        }`,
      );
    } else if (kind === 'reconnect' && turn && !turn.answered && turn.toolRan) {
      parts.push(
        `The line dropped while you were working on the student's last request ("${oneLine(
          turn.text,
        )}"). The app already handled that request, so do not run it again; wait for the student.`,
      );
    }
    let state: string | null = null;
    try {
      state = this.deps.getCallState?.() ?? null;
    } catch {
      state = null;
    }
    if (state && state.trim()) parts.push(`On screen now: ${oneLine(state)}`);
    return parts.join(' ');
  }

  /** The opening for a segment: the line to send (null: the agent's own) and whether to hide it. */
  private openingFor(
    kind: SegmentKind,
    capabilities: VoiceCapabilities,
  ): {line: string | null; quiet: boolean} {
    if (kind === 'start')
      return {
        line: this.openingLineFor(capabilities),
        quiet: this.deps.quietOpening === true,
      };
    // The agent's fixed greeting cannot be replaced: hide and silence it.
    if (capabilities.openingLine !== true) return {line: null, quiet: true};
    // The answer being asked again is the first thing heard.
    if (kind === 'reconnect' && this.replayPlan)
      return {line: '', quiet: false};
    return {
      line: kind === 'reconnect' ? RECONNECT_LINE : RESUME_LINE,
      quiet: false,
    };
  }

  /**
   * Opens one segment: the server session, then the socket and audio. A
   * reconnect reuses the call's capabilities and voice, keeps its phase
   * (`reconnecting`), and reports passing failures as `retry`.
   */
  private async openSegment(
    gen: number,
    kind: SegmentKind,
  ): Promise<SegmentResult> {
    const reconnecting = kind === 'reconnect';
    const stale = () => gen !== this.generation || this.disposed;
    const stop = (
      failure: ConversationFailureKind,
      message?: string,
    ): SegmentResult => {
      if (reconnecting && RETRYABLE.has(failure)) return 'retry';
      this.fail(gen, failure, message);
      return 'done';
    };

    const {gates, transport, api} = this.deps;
    if (!reconnecting) {
      if (!transport.available())
        return stop(
          'not_configured',
          'Voice conversation needs the updated LAFINA app on Android.',
        );
      if (gates.isGuest() || !gates.isSignedInOwner())
        return stop('signin_required');
      if (!gates.isOnlineMode()) return stop('online_mode_required');
      if (!gates.hasConsent()) return stop('consent_required');
      let online = false;
      try {
        online = await gates.isOnline();
      } catch {
        online = false;
      }
      if (stale()) return 'done';
      if (!online) return stop('offline');
      if (!this.checkAdmission(gen)) return 'done';
      let permitted = false;
      try {
        this.permissionPending = true;
        permitted = await gates.ensureMicPermission();
      } catch {
        permitted = false;
      } finally {
        this.permissionPending = false;
      }
      if (stale()) return 'done';
      if (!permitted) return stop('mic_denied');
      if (!this.checkAdmission(gen)) return 'done';
      if (gates.isForeground?.() === false) {
        this.stopForSystem(
          'The app left the screen before microphone access was ready. Tap Start when you return.',
        );
        return 'done';
      }
      try {
        this.callVoice = this.deps.getVoice();
      } catch {
        return stop(
          'voice_unavailable',
          'Your saved online voice could not be read. Choose a voice again in Profile.',
        );
      }
      this.update({
        voiceName: this.callVoice?.name ?? 'Default voice',
      });
    } else {
      // A reconnect never asks for anything new; access is checked again.
      if (!this.checkAdmission(gen)) return 'done';
      if (gates.isForeground?.() === false) {
        this.stopForSystem(BACKGROUND_REASON);
        return 'done';
      }
    }
    const voice = this.callVoice;
    const connectMs = reconnecting
      ? this.limits.reconnectAttemptTimeoutMs
      : this.limits.connectTimeoutMs;

    const controller = new AbortController();
    this.abort = controller;
    let apiTimedOut = false;
    this.timers.set('api_connect', connectMs, () => {
      apiTimedOut = true;
      controller.abort();
    });
    const awaitUntilAborted = <T>(work: Promise<T>): Promise<T | null> =>
      new Promise<T | null>(resolve => {
        let settled = false;
        const done = (value: T | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        const onAbort = () => done(null);
        if (controller.signal.aborted) {
          done(null);
          return;
        }
        controller.signal.addEventListener('abort', onAbort, {once: true});
        work.then(
          val => {
            controller.signal.removeEventListener('abort', onAbort);
            done(val);
          },
          () => {
            controller.signal.removeEventListener('abort', onAbort);
            done(null);
          },
        );
      });
    const startedAt = this.clock.now();
    const known = this.callCapabilities;
    const prepared = known ? null : this.takePrepared();
    const capabilities: ApiOutcome<VoiceCapabilities> | null = known
      ? {ok: true, data: known}
      : await awaitUntilAborted(
          prepared ?? api.capabilities(controller.signal),
        );
    if (stale()) {
      this.timers.clear('api_connect');
      return 'done';
    }
    if (apiTimedOut || !capabilities) {
      this.timers.clear('api_connect');
      return stop('connect_failed');
    }
    if (!capabilities.ok) {
      this.timers.clear('api_connect');
      return stop(...this.apiFailure(capabilities));
    }
    if (!capabilities.data.enabled) {
      this.timers.clear('api_connect');
      return stop('not_configured', capabilities.data.detail || undefined);
    }
    this.callCapabilities = capabilities.data;
    // The student may have switched mode or account meanwhile.
    if (!this.checkAdmission(gen)) {
      this.timers.clear('api_connect');
      return 'done';
    }

    let sessionClosedOnServer = false;
    const closeLateSession = (sessionId: string) => {
      if (sessionClosedOnServer) return;
      sessionClosedOnServer = true;
      void api.end(sessionId, null).catch(() => undefined);
    };
    const resumeOf =
      reconnecting &&
      capabilities.data.resume === true &&
      this.previousSessionId
        ? this.previousSessionId
        : undefined;
    const skipServerHandbook =
      capabilities.data.clientUstpTool === true &&
      this.deps.hasLocalHandbook?.() === true;
    const sessionPromise = api
      .createSession(
        {
          requestId: this.deps.newRequestId?.() ?? randomId(),
          voiceId: voice?.id ?? null,
          useHandbook: skipServerHandbook ? false : this.deps.useHandbook(),
          ...(resumeOf ? {resumeOf} : {}),
        },
        controller.signal,
      )
      .then(outcome => {
        if ((stale() || apiTimedOut) && outcome?.ok) {
          closeLateSession(outcome.data.sessionId);
        }
        return outcome;
      });
    // Built while the server creates the session, not after; handed to
    // native once, never stored or logged.
    let rawContext = '';
    try {
      rawContext = [this.segmentNote(kind), this.deps.getStudentContext?.()]
        .filter(Boolean)
        .join('\n\n');
    } catch {
      rawContext = this.segmentNote(kind);
    }
    const session = await awaitUntilAborted(sessionPromise);
    const sessionAt = this.clock.now();
    this.timers.clear('api_connect');
    if (stale()) {
      // Ended while the server was creating it: close it there too.
      if (session?.ok) closeLateSession(session.data.sessionId);
      return 'done';
    }
    if (apiTimedOut || !session) {
      if (session?.ok) closeLateSession(session.data.sessionId);
      return stop('connect_failed');
    }
    if (!session.ok) {
      // The server would not link this session to the dropped one (too old,
      // or not ours): continue without the link.
      if (
        resumeOf &&
        (session.status === 'validation_error' ||
          session.status === 'not_found')
      ) {
        this.previousSessionId = null;
        return 'retry';
      }
      return stop(...this.apiFailure(session));
    }
    if (!this.checkAdmission(gen)) {
      closeLateSession(session.data.sessionId);
      return 'done';
    }
    this.abort = null;
    if (kind === 'start' && this.deps.beforeAudio) {
      await this.deps.beforeAudio().catch(() => undefined);
      if (stale()) {
        closeLateSession(session.data.sessionId);
        return 'done';
      }
      if (!this.checkAdmission(gen)) {
        closeLateSession(session.data.sessionId);
        return 'done';
      }
    }
    const parked = this.parked;
    const soft =
      reconnecting &&
      parked !== null &&
      parked.soft &&
      typeof transport.reconnect === 'function';
    // A native session that can no longer be reused is released first, or
    // the new one would be refused as busy.
    if (parked && !soft) this.releaseParked();
    if (this.transportEndingPending) {
      await this.transportEnding.catch(() => undefined);
      if (stale()) {
        closeLateSession(session.data.sessionId);
        return 'done';
      }
      if (!this.checkAdmission(gen)) {
        closeLateSession(session.data.sessionId);
        return 'done';
      }
    }
    if (gates.isForeground?.() === false) {
      closeLateSession(session.data.sessionId);
      this.stopForSystem(
        reconnecting
          ? BACKGROUND_REASON
          : 'The app left the screen before audio started.',
      );
      return 'done';
    }

    const key = soft && parked ? parked.key : `vc-${gen}-${randomId()}`;
    const segment = ++this.segment;
    const live: LiveSession = {
      key,
      sessionId: session.data.sessionId,
      conversationId: null,
      segment,
      unsubscribe: () => undefined,
    };
    if (soft && parked) {
      live.unsubscribe = parked.unsubscribe;
      this.parked = null;
    } else {
      live.unsubscribe = transport.subscribe(key, event =>
        this.onEvent(gen, event, key),
      );
    }
    this.live = live;
    // Event ids start again with each conversation.
    this.seen = new Set();
    const studentContext =
      rawContext.length > 12000 ? rawContext.slice(0, 12000) : rawContext;
    const opening = this.openingFor(kind, capabilities.data);
    this.openingQuiet = opening.quiet;
    this.skipPersistText =
      kind !== 'start' && opening.line ? opening.line : null;
    const recap =
      kind !== 'start' && capabilities.data.resume === true
        ? callRecapTurns(this.snapshot.turns)
        : [];
    // student_context goes only to LAFINA's server (custom LLM extra body):
    // the agent's prompt never reads it, and dynamic variables are kept in
    // the voice provider's conversation history.
    const initiation = JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        tts: {voice_id: session.data.voiceId},
        ...(opening.line !== null
          ? {agent: {first_message: opening.line}}
          : {}),
      },
      dynamic_variables: {
        lafina_voice_grant: session.data.grant,
      },
      custom_llm_extra_body: {
        lafina_voice_grant: session.data.grant,
        ...(studentContext ? {student_context: studentContext} : {}),
        ...(recap.length ? {call_recap: recap} : {}),
        ...(kind !== 'start' && capabilities.data.resume === true
          ? {call_mode: kind}
          : {}),
      },
    });
    let timedOut = false;
    try {
      await new Promise<void>((resolve, reject) => {
        this.timers.set('connect', connectMs, () => {
          timedOut = true;
          reject(Object.assign(new Error('timeout'), {code: 'TIMEOUT'}));
        });
        const opened =
          soft && transport.reconnect
            ? transport.reconnect({
                sessionKey: key,
                url: session.data.signedUrl,
                initiation,
                allowLocalTestServer: this.deps.allowLocalTestServer === true,
                suppressOpeningAudio: opening.quiet,
              })
            : transport.start({
                sessionKey: key,
                url: session.data.signedUrl,
                initiation,
                allowLocalTestServer: this.deps.allowLocalTestServer === true,
                appOwnedAudio: this.deps.appOwnedAudio === true,
                ...(opening.quiet ? {suppressOpeningAudio: true} : {}),
                ...(reconnecting && this.snapshot.muted
                  ? {startMuted: true}
                  : {}),
              });
        opened.then(resolve, reject);
      });
    } catch (error) {
      this.timers.clear('connect');
      if (stale()) return 'done';
      if (this.snapshot.phase === 'failed') return 'done';
      const code = (error as {code?: unknown})?.code;
      this.log(
        `${reconnecting ? 'reconnect' : 'start'} failed (${
          typeof code === 'string' ? code : 'unknown'
        }${timedOut ? ', timeout' : ''})`,
      );
      if (code === 'PERMISSION_DENIED') return stop('mic_denied');
      if (code === 'MIC_IN_USE' || (!reconnecting && code === 'SESSION_BUSY'))
        return stop('mic_busy');
      if (code === 'AUDIO_FOCUS_DENIED')
        return stop(
          'audio',
          'Another app or a call is using audio right now. Try again when it ends.',
        );
      if (reconnecting) {
        // Try again with a new server session; the socket (and, when native
        // still holds it, the audio) is released or parked again.
        closeLateSession(session.data.sessionId);
        if (this.live === live) this.live = null;
        if (soft && code !== 'NOT_ACTIVE') {
          this.parked = {key, unsubscribe: live.unsubscribe, soft: true};
        } else {
          live.unsubscribe();
          this.endTransport(key);
        }
        return 'retry';
      }
      return stop('connect_failed');
    }
    this.timers.clear('connect');
    if (stale()) return 'done';
    if (!this.checkAdmission(gen) || this.live !== live) return 'done';
    const now = this.clock.now();
    // Timings only, for logcat: how long the student waited, and where.
    this.log(
      `${reconnecting ? 'reconnected' : 'connected'} in ${
        now - startedAt
      }ms (server ${sessionAt - startedAt}ms, audio ${
        now - sessionAt
      }ms, capabilities ${known ? 'known' : prepared ? 'prepared' : 'fetched'}${
        soft ? ', audio kept' : ''
      })`,
    );
    this.segmentStartedAt = now;
    const sessionEndsAt = now + session.data.maxDurationSeconds * 1000;
    // A reconnect never gives the call more time than it started with.
    const endsAt =
      reconnecting && typeof this.snapshot.endsAt === 'number'
        ? Math.min(this.snapshot.endsAt, sessionEndsAt)
        : sessionEndsAt;
    this.reconnectState = null;
    this.update({
      phase: 'listening',
      connectedAt: reconnecting ? this.snapshot.connectedAt ?? now : now,
      voiceName: voice?.name ?? 'Default voice',
      endsAt,
      reconnectAttempt: null,
      clientUstpTool: capabilities.data.clientUstpTool === true,
      ...(reconnecting
        ? {
            reconnects: (this.snapshot.reconnects ?? 0) + 1,
            notice: RECONNECTED_NOTICE,
          }
        : {}),
    });
    if (
      this.personaPreferences.language !== 'en' ||
      this.personaPreferences.pacing !== 'normal' ||
      this.personaPreferences.verbosity !== 'brief'
    ) {
      void this.sendContext(voicePreferenceContext(this.personaPreferences));
    }
    if (!reconnecting) {
      this.log('connected');
      this.limitReason = `The conversation reached its ${Math.round(
        session.data.maxDurationSeconds / 60,
      )}-minute limit. Start a new one to keep talking.`;
    }
    // ElevenLabs starts its own clock when the socket opens, before audio is
    // ready here, so end a little early and say why, instead of being cut off
    // by the server and showing "connection closed".
    const limitMs = session.data.maxDurationSeconds * 1000;
    this.timers.set(
      'limit',
      reconnecting
        ? Math.max(0, endsAt - now - LIMIT_EARLY_MS)
        : Math.max(limitMs / 2, limitMs - LIMIT_EARLY_MS),
      () => {
        if (gen === this.generation && this.limitReason)
          this.stopForSystem(this.limitReason);
      },
    );
    this.studentSpokeSinceAnswer = false;
    this.resetInactivity(gen);
    if (reconnecting) {
      this.timers.set('reconnected_notice', RECONNECTED_NOTICE_MS, () => {
        if (this.snapshot.notice === RECONNECTED_NOTICE)
          this.update({notice: null});
      });
      void this.replayIfNeeded(gen, live);
    }
    return 'ok';
  }

  /**
   * After a reconnect, the student's unanswered turn is sent once more as a
   * typed turn. It was already shown, saved and read on the device, so none
   * of that happens again; its echo is ignored.
   */
  private async replayIfNeeded(gen: number, live: LiveSession) {
    const plan = this.replayPlan;
    this.replayPlan = null;
    if (!plan) return;
    if (this.lastUserTurn) this.lastUserTurn.replayed = true;
    const sent = await this.deps.transport
      .sendMessage(
        live.key,
        JSON.stringify({type: 'user_message', text: plan.text}),
      )
      .catch(() => false);
    if (!sent || gen !== this.generation || this.live !== live) return;
    this.log('asked the unanswered turn again');
    const now = this.clock.now();
    this.typedEcho = {text: plan.text, at: now};
    this.openingQuiet = false;
    this.turnGeneration += 1;
    this.studentSpokeSinceAnswer = true;
    this.userFinalAt = now;
    this.firstTextAt = null;
    this.firstAudioAt = null;
    if (this.snapshot.phase !== 'speaking') this.update({phase: 'thinking'});
    this.timers.set('thinking', this.limits.thinkingTimeoutMs, () => {
      if (gen === this.generation) void this.explainSilence(gen);
    });
  }

  // ── Reconnect ─────────────────────────────────────────────────────────

  /** Whether this controller handles a lost internet connection itself. */
  handlesNetworkLoss = (): boolean => this.deps.autoReconnect === true;

  /**
   * The phone's connection changed (NetInfo). With `autoReconnect`, a short
   * loss is waited out; a longer one reconnects at once instead of waiting
   * for the dead socket to time out, and a returning connection starts the
   * next attempt straight away. Without it, any loss stops the call.
   */
  networkChanged = (connected: boolean): void => {
    if (this.disposed) return;
    const phase = this.snapshot.phase;
    if (!connected) {
      if (!this.isActive()) return;
      if (!this.deps.autoReconnect || phase === 'connecting') {
        this.stopForSystem(NETWORK_DROP_REASON);
        return;
      }
      const live = this.live;
      if (!live || phase === 'reconnecting') return;
      const gen = this.generation;
      this.timers.set('network_grace', this.limits.networkLostGraceMs, () => {
        if (gen !== this.generation || this.live !== live) return;
        const detach =
          typeof this.deps.transport.detach === 'function' &&
          typeof this.deps.transport.reconnect === 'function';
        if (
          !this.tryReconnect(gen, {
            code: 1006,
            reason: 'network',
            recoverable: detach,
            detach,
          })
        )
          this.stopForSystem(NETWORK_DROP_REASON);
      });
      return;
    }
    this.timers.clear('network_grace');
    const state = this.reconnectState;
    if (phase === 'reconnecting' && state && !state.inFlight)
      this.scheduleAttempt(this.generation, 0);
  };

  /** Starts reconnecting when the drop and the call allow it; false otherwise. */
  private tryReconnect(
    gen: number,
    drop: {
      code: number;
      reason: string;
      recoverable: boolean;
      detach?: boolean;
    },
  ): boolean {
    if (!this.deps.autoReconnect || !this.live || this.endAfter) return false;
    const kind = classifyDrop(drop.code, drop.reason);
    if (kind === 'stop') return false;
    if (kind === 'llm') {
      if (this.llmRetried) return false;
      this.llmRetried = true;
    }
    const now = this.clock.now();
    if (this.reconnectCount >= this.limits.maxReconnects) {
      this.log('reconnect skipped: too many this call');
      return false;
    }
    this.drops = this.drops.filter(at => now - at < FLAP_WINDOW_MS);
    if (this.drops.length >= FLAP_MAX_DROPS - 1) {
      this.log('reconnect skipped: the connection keeps dropping');
      return false;
    }
    const short = now - this.segmentStartedAt < SHORT_SEGMENT_MS;
    if (short && this.lastSegmentShort) {
      this.log('reconnect skipped: it dropped again right after connecting');
      return false;
    }
    const endsAt = this.snapshot.endsAt;
    if (typeof endsAt === 'number' && endsAt - now < MIN_SEGMENT_MS)
      return false;
    this.lastSegmentShort = short;
    this.drops.push(now);
    this.beginReconnect(gen, drop);
    return true;
  }

  private beginReconnect(
    gen: number,
    drop: {
      code: number;
      reason: string;
      recoverable: boolean;
      detach?: boolean;
    },
  ) {
    const live = this.live;
    if (!live) return;
    const now = this.clock.now();
    const pending = this.pending;
    const turn = this.lastUserTurn;
    const heard =
      pending && !pending.committed && pending.audioStarted
        ? sanitizeSpeechText(pending.text)
        : '';
    this.replayPlan =
      turn &&
      !turn.answered &&
      !turn.toolRan &&
      !turn.replayed &&
      now - turn.at <= this.limits.replayWindowMs &&
      this.callCapabilities?.openingLine === true
        ? {text: turn.text, heard}
        : null;
    const soft =
      drop.recoverable && typeof this.deps.transport.reconnect === 'function';
    if (soft && drop.detach && this.deps.transport.detach) {
      const key = live.key;
      void this.deps.transport
        .detach(key)
        .catch(() => false)
        .then(ok => {
          if (!ok && this.parked?.key === key) this.parked.soft = false;
        });
    }
    this.dropSegment(soft);
    this.reconnectCount += 1;
    this.reconnectState = {since: now, attempt: 0, inFlight: false};
    this.log(
      `connection dropped (code=${drop.code}); reconnecting${
        this.replayPlan ? ', will ask the last turn again' : ''
      }`,
    );
    this.update({
      phase: 'reconnecting',
      reconnectAttempt: 1,
      notice: RECONNECTING_NOTICE,
      micCapturing: false,
      level: 0,
      outputLevel: 0,
      toolPhrase: null,
    });
    this.scheduleAttempt(gen, 0);
  }

  private scheduleAttempt(gen: number, delayMs: number) {
    this.timers.set('reconnect', delayMs, () => {
      void this.attemptReconnect(gen);
    });
  }

  private async attemptReconnect(gen: number) {
    const state = this.reconnectState;
    if (
      gen !== this.generation ||
      this.disposed ||
      !state ||
      state.inFlight ||
      this.snapshot.phase !== 'reconnecting'
    )
      return;
    const now = this.clock.now();
    if (now - state.since >= this.limits.reconnectWindowMs) {
      this.log('reconnect gave up');
      this.stopForSystem(RECONNECT_FAILED_REASON);
      return;
    }
    const endsAt = this.snapshot.endsAt;
    if (
      typeof endsAt === 'number' &&
      endsAt - now < MIN_SEGMENT_MS &&
      this.limitReason
    ) {
      this.stopForSystem(this.limitReason);
      return;
    }
    state.inFlight = true;
    let online = false;
    try {
      online = await this.deps.gates.isOnline();
    } catch {
      online = false;
    }
    if (gen !== this.generation || this.reconnectState !== state) return;
    if (!online) {
      state.inFlight = false;
      this.scheduleAttempt(gen, OFFLINE_POLL_MS);
      return;
    }
    state.attempt += 1;
    this.update({reconnectAttempt: state.attempt});
    const result = await this.openSegment(gen, 'reconnect');
    if (gen !== this.generation || this.reconnectState !== state) return;
    state.inFlight = false;
    if (result === 'retry') {
      const delay =
        RECONNECT_BACKOFF_MS[
          Math.min(state.attempt - 1, RECONNECT_BACKOFF_MS.length - 1)
        ];
      this.scheduleAttempt(gen, delay);
    }
  }

  /**
   * Ends the current segment but not the call: the server session closes,
   * the socket is released (or, `park`, native keeps the audio waiting for
   * a new socket), and what LAFINA was saying is saved as interrupted.
   */
  private dropSegment(park: boolean) {
    this.speechPaused = false;
    // A tool still running belongs to the dropped segment: its result is
    // discarded, so it must not keep the new segment in "working".
    this.activeToolsForTurn = 0;
    this.abort?.abort();
    this.abort = null;
    this.timers.clearAll();
    const live = this.live;
    this.live = null;
    if (live) {
      if (park) {
        this.parked = {
          key: live.key,
          unsubscribe: live.unsubscribe,
          soft: true,
        };
      } else {
        live.unsubscribe();
        this.endTransport(live.key);
      }
      this.previousSessionId = live.sessionId;
      void this.deps.api
        .end(live.sessionId, live.conversationId)
        .catch(() => undefined);
    }
    this.closePending();
    this.dropProvisional();
    this.typedEcho = null;
  }

  private endTransport(key: string) {
    this.transportEndingPending = true;
    const ending = this.deps.transport
      .end(key)
      .catch(() => false)
      .finally(() => {
        // Only the latest end clears the flag; an older one may finish later.
        if (this.transportEnding === ending)
          this.transportEndingPending = false;
      });
    this.transportEnding = ending;
  }

  private releaseParked() {
    const parked = this.parked;
    this.parked = null;
    if (!parked) return;
    parked.unsubscribe();
    this.endTransport(parked.key);
  }

  /** Maps a failed server answer to what the student is told. */
  private apiFailure(
    outcome: Extract<ApiOutcome<unknown>, {ok: false}>,
  ): [ConversationFailureKind, string | undefined] {
    switch (outcome.status) {
      case 'auth_required':
        return [
          'signin_required',
          'Your sign-in has ended. Sign in again in Profile to Call Lafina.',
        ];
      case 'account_disabled':
        return ['signin_required', 'This account cannot use online features.'];
      case 'offline':
        return ['offline', undefined];
      case 'rate_limited':
        return ['limit_reached', outcome.message];
      case 'validation_error':
        return outcome.httpStatus === 422
          ? ['voice_unavailable', outcome.message]
          : ['provider', outcome.message];
      default:
        return [
          outcome.httpStatus === 503 ? 'not_configured' : 'provider',
          outcome.message,
        ];
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
      toolPhrase: null,
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
        toolPhrase: null,
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
      toolPhrase: null,
      endsAt: null,
    });
  };

  dispose = (): void => {
    this.prepared?.abort.abort();
    this.prepared = null;
    this.generation += 1;
    this.teardown();
    this.disposed = true;
    this.listeners.clear();
  };

  setMuted = async (muted: boolean): Promise<void> => {
    const live = this.live;
    if (!live && this.snapshot.phase === 'reconnecting') {
      // Kept for the reconnected segment; a parked native session is told now.
      if (this.desiredMuted === muted) return;
      this.desiredMuted = muted;
      this.update({muted, level: 0});
      const parked = this.parked;
      if (parked?.soft)
        void this.deps.transport.setMuted(parked.key, muted).catch(() => false);
      return;
    }
    if (!live || this.desiredMuted === muted) return;
    this.desiredMuted = muted;
    if (this.speechPaused) {
      this.update({muted, level: 0});
      return;
    }
    const gen = this.generation;
    const ok = await this.queueMute(
      live,
      () => this.speechPaused || this.desiredMuted,
    );
    if (gen !== this.generation || this.live !== live) return;
    if (ok) {
      if (this.desiredMuted === muted) {
        this.update({muted, level: muted ? 0 : this.snapshot.level});
        if (!muted) this.resetInactivity(gen);
      }
    } else if (this.desiredMuted === muted) {
      this.desiredMuted = this.snapshot.muted;
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
    const ok = await this.queueMute(
      live,
      () => this.speechPaused || this.desiredMuted,
    );
    if (gen !== this.generation || this.live !== live) return false;
    if (!ok && paused && this.speechPaused === paused) {
      this.speechPaused = false;
    }
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
    this.activeToolsForTurn = 0;
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
      this.update({phase: 'listening', outputLevel: 0, toolPhrase: null});
    } else {
      this.update({outputLevel: 0, toolPhrase: null});
    }
  };

  /** A typed turn while connected (recovery when speech is not recognized). */
  sendText = async (text: string): Promise<boolean> => {
    this.waitingForStudent = false;
    const live = this.live;
    const trimmed = text.trim().slice(0, this.limits.maxTypedChars);
    if (!live || !trimmed || this.snapshot.phase === 'connecting') return false;
    if (!this.checkAdmission(this.generation)) return false;
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
    if (!this.checkAdmission(this.generation)) return false;
    const sent = await this.deps.transport
      .sendMessage(live.key, JSON.stringify({type: 'contextual_update', text}))
      .catch(() => false);
    return sent && this.live === live;
  };

  // ── Events ────────────────────────────────────────────────────────────

  private onEvent(gen: number, event: TransportEvent, key?: string) {
    if (this.disposed) return;
    const parked = this.parked;
    if (parked && key === parked.key && this.live?.key !== key) {
      // The parked session only reports that it went away.
      if (gen !== this.generation) return;
      if (event.kind === 'backgrounded')
        return this.stopForSystem(BACKGROUND_REASON);
      if (event.kind === 'audio_focus_lost')
        return this.stopForSystem(FOCUS_REASON);
      if (event.kind === 'ended' || event.kind === 'error') parked.soft = false;
      return;
    }
    if (gen !== this.generation || !this.live) return;
    if (key !== undefined && this.live.key !== key) return;
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
        if (this.snapshot.phase === 'reconnecting') {
          // A reconnected socket closed before its start finished: retry.
          this.dropSegment(
            event.recoverable === true &&
              typeof this.deps.transport.reconnect === 'function',
          );
          const state = this.reconnectState;
          if (state) {
            state.inFlight = false;
            this.scheduleAttempt(gen, RECONNECT_BACKOFF_MS[0]);
          }
          return;
        }
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
        if (
          this.tryReconnect(gen, {
            code: event.code,
            reason: event.reason,
            recoverable: event.recoverable === true,
          })
        )
          return;
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
        return this.stopForSystem(BACKGROUND_REASON);
      case 'audio_focus_lost':
        return this.stopForSystem(FOCUS_REASON);
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
        // Native gave up holding the audio while a reconnect was running.
        if (this.snapshot.phase === 'reconnecting')
          return this.stopForSystem(RECONNECT_FAILED_REASON);
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
        // A tool ran for this turn: after a drop it is never asked again.
        if (this.lastUserTurn) this.lastUserTurn.toolRan = true;
        const params =
          payload.parameters &&
          typeof payload.parameters === 'object' &&
          !Array.isArray(payload.parameters)
            ? (payload.parameters as Record<string, unknown>)
            : {};
        const live = this.live;
        if (!live) return;
        const turn = this.turnGeneration;
        this.activeToolsForTurn += 1;
        const toolPhrase = getToolWorkingPhrase(toolName, params.kind);
        this.timers.clear('thinking');
        if (this.snapshot.phase !== 'speaking') {
          this.update({phase: 'tool_working', toolPhrase});
        }
        void (async () => {
          let answer =
            'This app cannot perform that request in this conversation.';
          let failed = false;
          let toolTimerHandle: unknown = null;
          try {
            if (!this.deps.onClientTool) failed = true;
            else {
              const toolPromise = this.deps.onClientTool(
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
              const timeoutPromise = new Promise<never>((_resolve, reject) => {
                toolTimerHandle = this.clock.setTimeout(
                  () => reject(new Error('tool timeout')),
                  this.limits.thinkingTimeoutMs,
                );
                this.activeToolTimers.add(toolTimerHandle);
              });
              answer = await Promise.race([toolPromise, timeoutPromise]);
            }
          } catch {
            failed = true;
            answer =
              'The app could not complete that request. Nothing was changed.';
          } finally {
            if (toolTimerHandle !== null) {
              this.activeToolTimers.delete(toolTimerHandle);
              this.clock.clearTimeout(toolTimerHandle);
            }
          }
          if (gen !== this.generation || this.live !== live) return;
          if (turn !== this.turnGeneration) {
            answer =
              'Request canceled because the student interrupted or changed their request. Nothing further was changed.';
            failed = true;
          } else {
            this.activeToolsForTurn = Math.max(0, this.activeToolsForTurn - 1);
            if (
              this.activeToolsForTurn === 0 &&
              this.snapshot.phase === 'tool_working'
            ) {
              this.update({phase: 'thinking', toolPhrase: null});
              this.timers.set('thinking', this.limits.thinkingTimeoutMs, () => {
                if (gen === this.generation) void this.explainSilence(gen);
              });
            }
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
        this.activeToolsForTurn = 0;
        this.deps.onTurnInterrupted?.();
        this.silenceRequestedAt =
          this.snapshot.phase === 'speaking' ? this.clock.now() : null;
        this.markInterrupted();
        if (
          this.snapshot.phase === 'speaking' ||
          this.snapshot.phase === 'thinking' ||
          this.snapshot.phase === 'tool_working'
        ) {
          this.update({phase: 'listening', outputLevel: 0, toolPhrase: null});
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
        void this.explainSilence(gen, true);
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
    // Event ids restart with each segment's conversation; turn ids must not.
    const segment = this.live?.segment ?? 0;
    const key =
      eventId !== null
        ? segment > 1
          ? `s${segment}:user:${eventId}`
          : `user:${eventId}`
        : null;
    if (key && this.seen.has(key)) return; // a duplicate final
    // Native playback resumes on any transcript; the text must match it.
    this.openingQuiet = false;
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
      // "Wait" needs no answer, so a drop never asks it again.
      if (this.lastUserTurn) this.lastUserTurn.answered = true;
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
    // The student's first words end the quiet opening; answers count again.
    this.openingQuiet = false;
    this.turnGeneration += 1;
    this.activeToolsForTurn = 0;
    // New words from the student: they are not leaving after all.
    this.cancelEndAfterReply();
    // A new turn closes the previous answer.
    if (this.pending && !this.pending.committed) {
      if (!this.pending.complete || this.snapshot.phase === 'speaking') {
        this.pending.interrupted = true;
      }
      this.commitAnswer();
    }
    this.studentSpokeSinceAnswer = true;
    this.lastUserTurn = {
      text: trimmed,
      at: this.clock.now(),
      toolRan: false,
      answered: false,
      replayed: false,
    };
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
      this.update({phase: 'thinking', notice: null, toolPhrase: null});
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
    if (this.openingQuiet || this.deps.suppressAgentResponse?.()) return;
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
    if (this.openingQuiet || this.deps.suppressAgentResponse?.()) {
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
    if (this.deps.appOwnedAudio) {
      this.deps.onAgentText?.(sanitized);
    } else {
      this.settleIfHeard();
    }
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
    if (this.openingQuiet) return;
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
    // LAFINA's "I'm back" after a reconnect is heard, not saved to Chat.
    if (
      this.skipPersistText !== null &&
      pending.text.trim() === sanitizeSpeechText(this.skipPersistText).trim()
    ) {
      this.skipPersistText = null;
      return;
    }
    if (!pending.interrupted && this.lastUserTurn)
      this.lastUserTurn.answered = true;
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
  private async explainSilence(gen: number, preserveNotice = false) {
    const live = this.live;
    if (!live) return;
    const status = await this.deps.api.status(live.sessionId).catch(() => null);
    if (gen !== this.generation) return;
    const serverDetail =
      status?.ok && status.data.lastErrorMessage
        ? humanizeProviderError(status.data.lastErrorMessage)
        : null;
    const nextPhase =
      this.snapshot.phase === 'thinking' ? 'listening' : this.snapshot.phase;
    if (preserveNotice && !serverDetail) {
      if (nextPhase !== this.snapshot.phase) this.update({phase: nextPhase});
      return;
    }
    this.update({
      notice:
        serverDetail ??
        'LAFINA is taking longer than usual. Keep talking, or end the conversation and use text chat.',
      phase: nextPhase,
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
    this.desiredMuted = false;
    this.activeToolsForTurn = 0;
    this.endAfter = null;
    this.abort?.abort();
    this.abort = null;
    this.timers.clearAll();
    for (const handle of this.activeToolTimers) {
      this.clock.clearTimeout(handle);
    }
    this.activeToolTimers.clear();
    this.reconnectState = null;
    this.replayPlan = null;
    this.releaseParked();
    const live = this.live;
    this.live = null;
    if (live) {
      live.unsubscribe();
      this.endTransport(live.key);
      void this.deps.api
        .end(live.sessionId, live.conversationId)
        .catch(() => undefined);
    }
    this.closePending();
    this.dropProvisional();
    this.typedEcho = null;
  }

  /** Whatever was being said is saved once, marked as not fully heard. */
  private closePending() {
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
  }

  /** Half-heard words are dropped from the screen (they were never final). */
  private dropProvisional() {
    if (this.provisionalUserId) {
      this.snapshot = {
        ...this.snapshot,
        turns: this.snapshot.turns.filter(t => t.id !== this.provisionalUserId),
      };
      this.provisionalUserId = null;
    }
  }
}
