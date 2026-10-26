import {NativeEventEmitter, NativeModules} from 'react-native';

export type SpeechInputEngine = 'android' | 'whisper';
export type SpeechInputEnginePreference = 'auto' | SpeechInputEngine;
export type SpeechInputLanguage = 'en-US' | 'fil-PH';
export interface SpeechInputCapabilities {
  available: boolean;
  reason?: string;
  sdk: number;
  permission: boolean;
  onDevice: boolean;
  whisper: boolean;
  selectedEngine: SpeechInputEngine | null;
}
export interface SpeechInputAcceptance {
  accepted: boolean;
  sessionId: string;
  reason?: string;
  engine?: SpeechInputEngine;
}
export interface SpeechInputEvent {
  sessionId: string;
  type:
    | 'preparing'
    | 'recording'
    | 'transcribing'
    | 'result'
    | 'error'
    | 'cancelled';
  /** Native elapsedRealtime timestamp since boot; not a request duration. */
  elapsedMs: number;
  transcript?: string;
  reason?: string;
  engine?: SpeechInputEngine;
  recordingMs?: number;
  transcriptionMs?: number;
}
export interface SpeechInputClient {
  capabilities(): Promise<SpeechInputCapabilities>;
  start(
    sessionId: string,
    language: SpeechInputLanguage,
    engine: SpeechInputEnginePreference,
  ): Promise<SpeechInputAcceptance>;
  stop(sessionId: string): Promise<SpeechInputAcceptance>;
  cancel(sessionId: string, reason: string): Promise<void>;
  dispose(): Promise<void>;
  openSettings(): Promise<boolean>;
  subscribe(listener: (event: SpeechInputEvent) => void): () => void;
}
export interface NativeSpeechInputBridge {
  capabilities(): Promise<string>;
  start(sessionId: string, language: string, engine: string): Promise<string>;
  stop(sessionId: string): Promise<string>;
  cancel(sessionId: string, reason: string): Promise<void>;
  dispose(): Promise<void>;
  openSettings(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const terminal = new Set<SpeechInputEvent['type']>([
  'result',
  'error',
  'cancelled',
]);
const unavailable: SpeechInputCapabilities = {
  available: false,
  reason: 'NATIVE_UNAVAILABLE',
  sdk: 0,
  permission: false,
  onDevice: false,
  whisper: false,
  selectedEngine: null,
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid speech input response');
  }
  return value as Record<string, unknown>;
}
function parse(value: string): Record<string, unknown> {
  if (typeof value !== 'string' || value.length > 16_384) {
    throw new Error('Invalid speech input response');
  }
  return object(JSON.parse(value) as unknown);
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.length || value.length > max) {
    throw new Error('Invalid speech input text');
  }
  return value;
}
function id(value: unknown): string {
  const result = text(value, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) {
    throw new Error('Invalid speech input identity');
  }
  return result;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Invalid speech input capability');
  }
  return value;
}
function measurement(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Invalid speech input measurement');
  }
  return value;
}
function engine(value: unknown): SpeechInputEngine {
  if (value !== 'android' && value !== 'whisper') {
    throw new Error('Invalid offline speech engine');
  }
  return value;
}
function details(row: Record<string, unknown>) {
  return {
    ...(row.reason == null ? {} : {reason: text(row.reason, 100)}),
    ...(row.engine == null ? {} : {engine: engine(row.engine)}),
  };
}
function capabilities(value: string): SpeechInputCapabilities {
  const row = parse(value);
  const sdk = measurement(row.sdk);
  if (!Number.isInteger(sdk) || sdk > 100) {
    throw new Error('Invalid Android version');
  }
  const result: SpeechInputCapabilities = {
    available: flag(row.available),
    ...(row.reason == null ? {} : {reason: text(row.reason, 100)}),
    sdk,
    permission: flag(row.permission),
    onDevice: flag(row.onDevice),
    whisper: flag(row.whisper),
    selectedEngine:
      row.selectedEngine === null ? null : engine(row.selectedEngine),
  };
  if (
    (result.onDevice && sdk < 31) ||
    (result.available &&
      (!result.selectedEngine ||
        (result.selectedEngine === 'android' && !result.onDevice) ||
        (result.selectedEngine === 'whisper' && !result.whisper)))
  ) {
    throw new Error('Android did not report a usable offline speech engine');
  }
  return result;
}
function acceptance(value: string, sessionId: string): SpeechInputAcceptance {
  const row = parse(value);
  if (id(row.sessionId) !== sessionId) {
    throw new Error('Speech input identity changed');
  }
  return {sessionId, accepted: flag(row.accepted), ...details(row)};
}
function event(value: unknown): SpeechInputEvent {
  const row = object(value);
  if (
    ![
      'preparing',
      'recording',
      'transcribing',
      'result',
      'error',
      'cancelled',
    ].includes(String(row.type))
  ) {
    throw new Error('Invalid speech input event');
  }
  const type = row.type as SpeechInputEvent['type'];
  const transcript =
    type === 'result' ? text(row.transcript, 2000).trim() : undefined;
  if (
    (type === 'result' && !transcript) ||
    (type !== 'result' && row.transcript != null)
  ) {
    throw new Error('Invalid speech input transcript');
  }
  return {
    sessionId: id(row.sessionId),
    type,
    elapsedMs: measurement(row.elapsedMs),
    ...details(row),
    ...(transcript === undefined ? {} : {transcript}),
    ...(row.recordingMs == null
      ? {}
      : {recordingMs: measurement(row.recordingMs)}),
    ...(row.transcriptionMs == null
      ? {}
      : {transcriptionMs: measurement(row.transcriptionMs)}),
  };
}

/** No generic/cloud recognizer path exists here; text is never an action. */
export function createSpeechInputClient(
  bridge: () => NativeSpeechInputBridge | undefined,
  listen: (listener: (value: unknown) => void) => () => void,
): SpeechInputClient {
  let current: string | null = null;
  return {
    async capabilities() {
      const native = bridge();
      return native
        ? capabilities(await native.capabilities())
        : {...unavailable};
    },
    async start(sessionId, language, preference) {
      id(sessionId);
      if (
        !['en-US', 'fil-PH'].includes(language) ||
        !['auto', 'android', 'whisper'].includes(preference)
      ) {
        throw new Error(
          'Choose an available speech language and offline engine.',
        );
      }
      if (current) return {accepted: false, sessionId, reason: 'BUSY'};
      const native = bridge();
      if (!native) {
        return {accepted: false, sessionId, reason: 'NATIVE_UNAVAILABLE'};
      }
      current = sessionId;
      try {
        const result = acceptance(
          await native.start(sessionId, language, preference),
          sessionId,
        );
        if (
          result.accepted &&
          preference !== 'auto' &&
          result.engine !== undefined &&
          result.engine !== preference
        ) {
          throw new Error('Speech input engine selection changed');
        }
        if (!result.accepted && current === sessionId) current = null;
        return result;
      } catch (error) {
        if (current === sessionId) current = null;
        void native
          .cancel(sessionId, 'invalid_start_response')
          .catch(() => undefined);
        throw error;
      }
    },
    async stop(sessionId) {
      id(sessionId);
      const native = bridge();
      if (!native) {
        return {accepted: false, sessionId, reason: 'NATIVE_UNAVAILABLE'};
      }
      try {
        return acceptance(await native.stop(sessionId), sessionId);
      } catch (error) {
        if (current === sessionId) current = null;
        void native
          .cancel(sessionId, 'invalid_stop_response')
          .catch(() => undefined);
        throw error;
      }
    },
    async cancel(sessionId, reason) {
      id(sessionId);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(reason)) {
        throw new Error('Invalid speech input cancellation');
      }
      if (current === sessionId) current = null;
      await bridge()?.cancel(sessionId, reason);
    },
    async dispose() {
      current = null;
      await bridge()?.dispose();
    },
    async openSettings() {
      const native = bridge();
      return native ? flag(await native.openSettings()) : false;
    },
    subscribe(listener) {
      return listen(value => {
        let parsed: SpeechInputEvent;
        try {
          parsed = event(value);
        } catch {
          const failed = current;
          if (!failed) return;
          current = null;
          void bridge()
            ?.cancel(failed, 'invalid_native_event')
            .catch(() => undefined);
          listener({
            sessionId: failed,
            type: 'error',
            elapsedMs: 0,
            reason: 'INVALID_NATIVE_EVENT',
          });
          return;
        }
        if (parsed.sessionId !== current) return;
        if (terminal.has(parsed.type)) current = null;
        listener(parsed);
      });
    },
  };
}

export const speechInputClient = createSpeechInputClient(
  () => NativeModules.CapstoneStt as NativeSpeechInputBridge | undefined,
  listener => {
    const native = NativeModules.CapstoneStt as
      | NativeSpeechInputBridge
      | undefined;
    if (!native) return () => undefined;
    const subscription = new NativeEventEmitter(native).addListener(
      'CapstoneSttEvent',
      listener,
    );
    return () => subscription.remove();
  },
);
