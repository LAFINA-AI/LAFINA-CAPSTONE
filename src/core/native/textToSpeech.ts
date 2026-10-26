import {NativeEventEmitter, NativeModules} from 'react-native';
import {validateSpeechPreferences} from '../domain/preferences';
import type {SpeechPreferences} from '../domain/preferences';

export interface SpeechVoice {
  name: string;
  languageTag: string;
  offline: boolean;
  installed: boolean;
  quality: number;
  latency: number;
}
export interface SpeechInventory {
  available: boolean;
  reason?: string;
  /** Requested/system selection; public Android APIs do not prove binder identity. */
  enginePackage: string | null;
  engines: Array<{packageName: string; label: string}>;
  voices: SpeechVoice[];
  selectedVoiceName: string | null;
  initializationMs: number | null;
}
export interface SpeechEvent {
  requestId: string;
  type: 'requested' | 'start' | 'done' | 'error' | 'cancelled';
  /** Monotonic elapsedRealtime timestamp since boot, not a request duration. */
  elapsedMs: number;
  reason?: string;
  /** Native playback callback interval, not a measurement of first audibility. */
  requestToStartMs?: number;
}
export interface SpeechAcceptance {
  accepted: boolean;
  requestId: string;
  reason?: string;
}
export interface SpeechClient {
  initialize(options: SpeechPreferences): Promise<SpeechInventory>;
  speak(requestId: string, text: string): Promise<SpeechAcceptance>;
  stop(reason: string): Promise<void>;
  dispose(): Promise<void>;
  openSettings(): Promise<boolean>;
  diagnostics(): Promise<{events: SpeechEvent[]}>;
  subscribe(listener: (event: SpeechEvent) => void): () => void;
}
export interface NativeSpeechBridge {
  initialize(optionsJson: string): Promise<string>;
  speak(requestId: string, text: string): Promise<string>;
  stop(reason: string): Promise<void>;
  dispose(): Promise<void>;
  openSettings(): Promise<boolean>;
  diagnostics(): Promise<string>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const unavailable: SpeechInventory = {
  available: false,
  reason: 'NATIVE_UNAVAILABLE',
  enginePackage: null,
  engines: [],
  voices: [],
  selectedVoiceName: null,
  initializationMs: null,
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Android speech response');
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 512): string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    throw new Error('Invalid Android speech text');
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid speech capability');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('Invalid speech measurement');
  return value;
}
function parse(raw: string): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length > 512_000)
    throw new Error('Invalid Android speech response');
  return object(JSON.parse(raw) as unknown);
}
function optionalReason(row: Record<string, unknown>): {reason?: string} {
  return row.reason == null ? {} : {reason: string(row.reason, 200)};
}
function event(value: unknown): SpeechEvent {
  const row = object(value);
  if (
    !['requested', 'start', 'done', 'error', 'cancelled'].includes(
      String(row.type),
    )
  )
    throw new Error('Invalid speech event');
  return {
    requestId: string(row.requestId, 80),
    type: row.type as SpeechEvent['type'],
    elapsedMs: number(row.elapsedMs),
    ...optionalReason(row),
    ...(row.requestToStartMs == null
      ? {}
      : {requestToStartMs: number(row.requestToStartMs)}),
  };
}
function inventory(raw: string): SpeechInventory {
  const row = parse(raw);
  if (
    !Array.isArray(row.engines) ||
    row.engines.length > 50 ||
    !Array.isArray(row.voices) ||
    row.voices.length > 500
  )
    throw new Error('Invalid speech inventory');
  const result: SpeechInventory = {
    available: flag(row.available),
    ...optionalReason(row),
    enginePackage:
      row.enginePackage === null ? null : string(row.enginePackage, 200),
    selectedVoiceName:
      row.selectedVoiceName === null ? null : string(row.selectedVoiceName),
    initializationMs:
      row.initializationMs === null ? null : number(row.initializationMs),
    engines: row.engines.map(item => {
      const engine = object(item);
      return {
        packageName: string(engine.packageName, 200),
        label: string(engine.label, 200),
      };
    }),
    voices: row.voices.map(item => {
      const voice = object(item);
      return {
        name: string(voice.name),
        languageTag: string(voice.languageTag, 64),
        offline: flag(voice.offline),
        installed: flag(voice.installed),
        quality: number(voice.quality),
        latency: number(voice.latency),
      };
    }),
  };
  if (
    result.available &&
    !result.voices.some(
      v => v.name === result.selectedVoiceName && v.offline && v.installed,
    )
  )
    throw new Error('Android did not verify an installed offline voice');
  return result;
}

/** This boundary never treats an engine callback as proof of audible offline speech. */
export function createSpeechClient(
  bridge: () => NativeSpeechBridge | undefined,
  listen: (listener: (value: unknown) => void) => () => void,
): SpeechClient {
  let currentRequest = 'speech';
  return {
    async initialize(options) {
      const problem = validateSpeechPreferences(options);
      if (problem) throw new Error(problem);
      const native = bridge();
      return native
        ? inventory(await native.initialize(JSON.stringify(options)))
        : {...unavailable};
    },
    async speak(requestId, text) {
      if (
        !/^[A-Za-z0-9_-]{1,80}$/.test(requestId) ||
        !text.trim() ||
        text.length > 600
      )
        throw new Error('Use a short speech request and nonempty text.');
      currentRequest = requestId;
      const native = bridge();
      if (!native)
        return {accepted: false, requestId, reason: 'NATIVE_UNAVAILABLE'};
      const result = parse(await native.speak(requestId, text));
      if (result.requestId !== requestId)
        throw new Error('Speech request identity changed');
      return {
        accepted: flag(result.accepted),
        requestId,
        ...optionalReason(result),
      };
    },
    async stop(reason) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(reason))
        throw new Error('Invalid stop reason');
      await bridge()?.stop(reason);
    },
    async dispose() {
      await bridge()?.dispose();
    },
    async openSettings() {
      const native = bridge();
      return native ? flag(await native.openSettings()) : false;
    },
    async diagnostics() {
      const native = bridge();
      if (!native) return {events: []};
      const row = parse(await native.diagnostics());
      if (!Array.isArray(row.events) || row.events.length > 200)
        throw new Error('Invalid speech history');
      return {events: row.events.map(event)};
    },
    subscribe(listener) {
      return listen(value => {
        let parsed: SpeechEvent;
        try {
          parsed = event(value);
        } catch {
          // Malformed callbacks fail toward text. Never surface a raw native payload.
          parsed = {
            requestId: currentRequest,
            type: 'error',
            elapsedMs: 0,
            reason: 'INVALID_NATIVE_EVENT',
          };
          void bridge()
            ?.stop('invalid_native_event')
            .catch(() => undefined);
        }
        listener(parsed);
      });
    },
  };
}

export const speechClient = createSpeechClient(
  () => NativeModules.CapstoneTts as NativeSpeechBridge | undefined,
  listener => {
    const native = NativeModules.CapstoneTts as NativeSpeechBridge | undefined;
    if (!native) return () => undefined;
    const subscription = new NativeEventEmitter(native).addListener(
      'CapstoneTtsEvent',
      listener,
    );
    return () => subscription.remove();
  },
);
