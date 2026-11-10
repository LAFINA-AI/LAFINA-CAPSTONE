import {DeviceEventEmitter, NativeModules} from 'react-native';
import type {TransportEvent, VoiceTransport} from './types';

interface NativeVoiceConversation {
  start(options: {
    sessionKey: string;
    url: string;
    initiation: string;
    allowLocalTestServer?: boolean;
  }): Promise<boolean>;
  setMuted(sessionKey: string, muted: boolean): Promise<boolean>;
  stopResponse(sessionKey: string): Promise<boolean>;
  sendMessage(sessionKey: string, json: string): Promise<boolean>;
  end(sessionKey: string): Promise<boolean>;
}

export const NATIVE_EVENT = 'LafinaVoiceConversationEvent';

const native = (): NativeVoiceConversation | null => {
  const module = NativeModules.LafinaVoiceConversation as
    | NativeVoiceConversation
    | undefined;
  return module?.start ? module : null;
};

type RawEvent = {sessionKey?: unknown; kind?: unknown} & Record<
  string,
  unknown
>;

/** Converts a native event map to a typed event, or null for anything unexpected. */
export const parseNativeEvent = (raw: RawEvent): TransportEvent | null => {
  const str = (key: string) =>
    typeof raw[key] === 'string' ? (raw[key] as string) : '';
  switch (raw.kind) {
    case 'open':
    case 'audio_focus_lost':
    case 'backgrounded':
      return {kind: raw.kind};
    case 'message':
      return typeof raw.data === 'string'
        ? {kind: 'message', data: raw.data}
        : null;
    case 'playback':
      return {kind: 'playback', speaking: raw.speaking === true};
    case 'output_level':
      return {
        kind: 'output_level',
        level:
          typeof raw.level === 'number'
            ? Math.max(0, Math.min(1, raw.level))
            : 0,
      };
    case 'mic':
      return {kind: 'mic', capturing: raw.capturing === true};
    case 'level':
      return {
        kind: 'level',
        level:
          typeof raw.level === 'number'
            ? Math.max(0, Math.min(1, raw.level))
            : 0,
      };
    case 'closed':
      return {
        kind: 'closed',
        code: typeof raw.code === 'number' ? raw.code : 0,
        reason: str('reason'),
      };
    case 'error':
      return {kind: 'error', code: str('code'), message: str('message')};
    case 'ended':
      return {kind: 'ended', reason: str('reason')};
    default:
      return null;
  }
};

/**
 * The Android bridge (`LafinaVoiceConversationModule`). Nothing is loaded or
 * connected until `start`; when the module is missing, `available()` is false
 * and the feature is simply not offered.
 */
export const nativeVoiceTransport: VoiceTransport = {
  available: () => native() !== null,
  async start(options) {
    const module = native();
    if (!module)
      throw Object.assign(new Error('Voice conversation is unavailable.'), {
        code: 'UNAVAILABLE',
      });
    await module.start(options);
  },
  setMuted: async (key, muted) =>
    (await native()?.setMuted(key, muted)) ?? false,
  stopResponse: async key => (await native()?.stopResponse(key)) ?? false,
  sendMessage: async (key, json) =>
    (await native()?.sendMessage(key, json)) ?? false,
  end: async key => (await native()?.end(key)) ?? false,
  subscribe(sessionKey, listener) {
    const subscription = DeviceEventEmitter.addListener(
      NATIVE_EVENT,
      (raw: RawEvent) => {
        if (!raw || raw.sessionKey !== sessionKey) return;
        const event = parseNativeEvent(raw);
        if (event) listener(event);
      },
    );
    return () => subscription.remove();
  },
};
