/**
 * Live voice conversation (Online Mode, signed-in only): shared types.
 *
 * The phone streams microphone audio to an ElevenLabs agent over a signed
 * WebSocket; ElevenLabs transcribes, decides when a turn ends, handles
 * interruptions and speaks with the selected voice. Each turn's answer comes
 * from LAFINA's server (DeepSeek). See ADR-030.
 */

/** What the conversation is doing right now; drives the status line. */
export type ConversationPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'tool_working'
  | 'speaking'
  /** Stopped by something other than the student (background, call, network): restart explicitly. */
  | 'restart_required'
  | 'ended'
  | 'failed';

export type ConversationFailureKind =
  | 'signin_required'
  | 'online_mode_required'
  | 'offline'
  | 'consent_required'
  | 'mic_denied'
  | 'mic_busy'
  | 'not_configured'
  | 'voice_unavailable'
  | 'limit_reached'
  | 'provider'
  | 'connect_failed'
  | 'audio';

export interface ConversationFailure {
  kind: ConversationFailureKind;
  message: string;
}

export type TurnStatus = 'provisional' | 'final' | 'interrupted';

export interface ConversationTurn {
  /** Stable for the life of the turn (the provider's event id when known). */
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status: TurnStatus;
}

export interface ConversationTiming {
  /** Final user transcript → first answer text (ms). */
  toFirstText?: number;
  /** Final user transcript → first audible audio queued for playback (ms). */
  toFirstAudio?: number;
  /** Interruption or Stop → playback silenced (ms). */
  toSilence?: number;
}

export interface ConversationSnapshot {
  /** Monotonic session start for consistent full-screen/mini-bar elapsed time. */
  connectedAt?: number | null;
  phase: ConversationPhase;
  muted: boolean;
  /** True only while the native recorder is actually capturing. */
  micCapturing: boolean;
  /** 0..1 microphone level while capturing (for the meter). */
  level: number;
  /** 0..1 assistant playback audio level while speaking (for assistant waveform). */
  outputLevel: number;
  /** Truthful progress phrase for active client tool execution, if any. */
  toolPhrase: string | null;
  turns: readonly ConversationTurn[];
  /** Short, non-blocking information line (for example a slow answer). */
  notice: string | null;
  failure: ConversationFailure | null;
  /** Why a running conversation was stopped by the system. */
  restartReason: string | null;
  /** The voice this session speaks with. */
  voiceName: string | null;
  /** Epoch ms when the server-side session limit ends the conversation. */
  endsAt: number | null;
  lastTiming: ConversationTiming | null;
}

export interface VoiceCapabilities {
  enabled: boolean;
  maxDurationSeconds: number;
  maxTurns: number;
  detail?: string | null;
}

export interface VoiceSessionGrant {
  sessionId: string;
  signedUrl: string;
  grant: string;
  voiceId: string;
  expiresAt: string;
  maxDurationSeconds: number;
  maxTurns: number;
}

export interface VoiceSessionStatus {
  status: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export type ApiOutcome<T> =
  | {ok: true; data: T}
  | {
      ok: false;
      /** HTTP-ish category, mapped from the cloud client. */
      status:
        | 'auth_required'
        | 'account_disabled'
        | 'offline'
        | 'rate_limited'
        | 'validation_error'
        | 'server_unavailable'
        | 'server_error'
        | 'not_found';
      httpStatus?: number;
      message: string;
    };

export interface VoiceConversationApi {
  capabilities(signal: AbortSignal): Promise<ApiOutcome<VoiceCapabilities>>;
  createSession(
    body: {requestId: string; voiceId: string | null; useHandbook: boolean},
    signal: AbortSignal,
  ): Promise<ApiOutcome<VoiceSessionGrant>>;
  connected(sessionId: string, conversationId: string): Promise<unknown>;
  end(sessionId: string, conversationId: string | null): Promise<unknown>;
  status(sessionId: string): Promise<ApiOutcome<VoiceSessionStatus>>;
}

/** Events the native bridge sends, already filtered to one session key. */
export type TransportEvent =
  | {kind: 'open'}
  | {kind: 'message'; data: string}
  | {kind: 'playback'; speaking: boolean}
  | {kind: 'output_level'; level: number}
  | {kind: 'mic'; capturing: boolean}
  | {kind: 'level'; level: number}
  | {kind: 'closed'; code: number; reason: string}
  | {kind: 'error'; code: string; message: string}
  | {kind: 'audio_focus_lost'}
  | {kind: 'backgrounded'}
  | {kind: 'ended'; reason: string};

export interface VoiceTransport {
  available(): boolean;
  start(options: {
    sessionKey: string;
    url: string;
    initiation: string;
    allowLocalTestServer?: boolean;
  }): Promise<void>;
  setMuted(sessionKey: string, muted: boolean): Promise<boolean>;
  stopResponse(sessionKey: string): Promise<boolean>;
  sendMessage(sessionKey: string, json: string): Promise<boolean>;
  end(sessionKey: string): Promise<boolean>;
  subscribe(
    sessionKey: string,
    listener: (event: TransportEvent) => void,
  ): () => void;
}

export interface ConversationClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Where finished turns go (the account's chat history). Called once per turn. */
export interface ConversationPersistence {
  userTurn(text: string): void;
  assistantTurn(text: string, heard: 'complete' | 'interrupted'): void;
}
