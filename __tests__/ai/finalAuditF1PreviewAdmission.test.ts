/**
 * Final audit F1 (codex-final-audit-940802c-20261106.md): a Preview's
 * admission is revalidated after every awaited startup step and immediately
 * before playback. Configuration and initialization are each held pending,
 * then the account changes, dictation takes the microphone, a meeting starts
 * recording, or the Preview is stopped; when the held work is released the
 * stale Preview must never reach Tts.speak. Jest react-native-tts fake and
 * real SQLite; no audible speech, microphone or recorder is claimed.
 */
import {NativeModules, Platform} from 'react-native';
import Tts from 'react-native-tts';
import {db, initDatabase, userStore} from '../../src/storage';
import {speechSettingsStore as speech} from '../../src/storage/speechSettingsStore';
import {__resetTtsForTests, initTts} from '../../src/ai/tts/ttsService';
import * as preferences from '../../src/ai/tts/speechPreferences';
import {startVoicePreview} from '../../src/ai/tts/speechPreferences';
import type {PreviewHandle} from '../../src/ai/tts/speechPreferences';
import {
  cancelOfflineSpeechCapture,
  startOfflineSpeechCapture,
} from '../../src/ai/native/speechCapture';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';

type Mock = jest.Mock;
const tts = Tts as unknown as Record<string, Mock>;

const VOICES = [
  {id: 'en-us-x-sfg-local', name: 'en-USOffline', language: 'en-US', quality: 400, networkConnectionRequired: false, notInstalled: false},
  {id: 'en-gb-x-gba-local', name: 'en-GBOffline', language: 'en-GB', quality: 400, networkConnectionRequired: false, notInstalled: false},
];

const originals: Record<string, ((...args: unknown[]) => unknown) | undefined> = {};
const originalOs = Platform.OS;

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `f1-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

const deferred = () => {
  let resolve: (value?: unknown) => void = () => undefined;
  const promise = new Promise<unknown>(done => {
    resolve = done;
  });
  return {promise, resolve};
};

/** Lets awaited work run until `condition` holds (real timers only). */
const until = async (condition: () => boolean, what: string) => {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${what}`);
};

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve));
};

type Hold = 'configuration' | 'initialization';

/**
 * Holds the named startup step pending and returns its release. Configuration:
 * the engine is already up and the owner's saved speed is being applied.
 * Initialization: the engine has not started and its start does not answer.
 */
const hold = async (kind: Hold, userId: string) => {
  const gate = deferred();
  if (kind === 'configuration') {
    expect(await initTts()).toBe(true);
    speech.save(userId, {voiceId: 'en-gb-x-gba-local', rate: 1.25, pitch: 1}, 0);
    tts.setDefaultRate.mockImplementationOnce(() => gate.promise);
    return {
      gate,
      reached: () => tts.setDefaultRate.mock.calls.length > 0,
    };
  }
  __resetTtsForTests();
  tts.getInitStatus.mockImplementationOnce(() => gate.promise.then(() => 'success'));
  return {
    gate,
    reached: () => tts.getInitStatus.mock.calls.length > 0,
  };
};

/** Whatever startVoicePreview returned, make sure nothing is left playing. */
const drain = async (value: unknown) => {
  if (value && typeof value === 'object') {
    const handle = value as PreviewHandle;
    await handle.stop();
    await handle.result;
  }
};

beforeAll(async () => {
  await initDatabase();
  for (const key of ['getInitStatus', 'setDefaultRate', 'voices', 'speak']) {
    originals[key] = tts[key].getMockImplementation();
  }
});

beforeEach(() => {
  __resetTtsForTests();
  for (const key of ['speak', 'setDefaultRate', 'getInitStatus', 'stop']) tts[key].mockClear();
  tts.voices.mockImplementation(() => Promise.resolve(VOICES));
});

afterEach(async () => {
  jest.restoreAllMocks();
  for (const [key, impl] of Object.entries(originals)) tts[key].mockImplementation(impl);
  Platform.OS = originalOs;
  db.executeSync('DELETE FROM active_session');
});

describe.each<Hold>(['configuration', 'initialization'])(
  'final audit F1: Preview with %s held pending',
  kind => {
    it('an account change meanwhile refuses the stale Preview; it never speaks', async () => {
      const a = owner(`acct-${kind}`);
      userStore.setCurrentUser(a);
      const held = await hold(kind, a);
      const pending = startVoicePreview(a);
      await until(held.reached, `${kind} to start`);

      userStore.setCurrentUser(owner(`acct-b-${kind}`));
      held.gate.resolve();
      const outcome = await pending;
      await settle();
      expect(tts.speak).not.toHaveBeenCalled();
      expect(outcome).toBe('owner_changed');
      await drain(outcome);
    });

    it('dictation taking the microphone meanwhile refuses the Preview; it never speaks', async () => {
      const a = owner(`mic-${kind}`);
      userStore.setCurrentUser(a);
      const held = await hold(kind, a);
      const pending = startVoicePreview(a);
      await until(held.reached, `${kind} to start`);

      const listening = NativeModules.LafinaSpeechToText.startListening as Mock;
      listening.mockImplementationOnce(() => new Promise(() => undefined));
      const capture = startOfflineSpeechCapture({mode: 'manual', bargeIn: false, context: 'main_mic'});
      try {
        held.gate.resolve();
        const outcome = await pending;
        await settle();
        expect(tts.speak).not.toHaveBeenCalled();
        expect(outcome).toBe('microphone_busy');
        await drain(outcome);
      } finally {
        await cancelOfflineSpeechCapture(capture.captureId);
      }
    });

    it('a meeting recording started from the app meanwhile refuses the Preview; it never speaks', async () => {
      const a = owner(`meet-${kind}`);
      userStore.setCurrentUser(a);
      Platform.OS = 'android';
      const held = await hold(kind, a);
      const pending = startVoicePreview(a);
      await until(held.reached, `${kind} to start`);

      // The native recorder fake still answers isRecording() = false: the
      // app's own start of a recording must be enough to refuse.
      await meetingRecorder.start('meeting-f1', 'F1');
      try {
        held.gate.resolve();
        const outcome = await pending;
        await settle();
        expect(tts.speak).not.toHaveBeenCalled();
        expect(outcome).toBe('recording');
        await drain(outcome);
      } finally {
        await meetingRecorder.stop();
      }
    });

    it('a recording the native recorder reports meanwhile refuses the Preview; it never speaks', async () => {
      const a = owner(`native-${kind}`);
      userStore.setCurrentUser(a);
      Platform.OS = 'android';
      const held = await hold(kind, a);
      const pending = startVoicePreview(a);
      await until(held.reached, `${kind} to start`);

      jest.spyOn(meetingRecorder, 'isRecording').mockResolvedValue(true);
      held.gate.resolve();
      const outcome = await pending;
      await settle();
      expect(tts.speak).not.toHaveBeenCalled();
      expect(outcome).toBe('recording');
      await drain(outcome);
    });

    it('Stop before any playback token exists cancels the pending start; it never speaks', async () => {
      const a = owner(`stop-${kind}`);
      userStore.setCurrentUser(a);
      const held = await hold(kind, a);
      const ticket = preferences.createPreviewTicket(a);
      const pending = startVoicePreview(a, ticket);
      await until(held.reached, `${kind} to start`);

      await ticket.cancel();
      expect(ticket.cancelled).toBe(true);
      held.gate.resolve();
      const outcome = await pending;
      await settle();
      expect(tts.speak).not.toHaveBeenCalled();
      expect(outcome).toBe('cancelled');
      await drain(outcome);
    });

    it('with nothing changed the released Preview still plays once and reports its outcome', async () => {
      const a = owner(`ok-${kind}`);
      userStore.setCurrentUser(a);
      const held = await hold(kind, a);
      const ticket = preferences.createPreviewTicket(a);
      const pending = startVoicePreview(a, ticket);
      await until(held.reached, `${kind} to start`);

      held.gate.resolve();
      const outcome = await pending;
      expect(typeof outcome).toBe('object');
      expect(tts.speak).toHaveBeenCalledTimes(1);
      expect(await (outcome as PreviewHandle).result).toBe('finished');
      if (kind === 'configuration') {
        expect(tts.setDefaultRate).toHaveBeenLastCalledWith(1.25, true);
      }
    });
  },
);

describe('final audit F1: the ticket stops its own playing Preview only', () => {
  it('cancelling after playback began stops this Preview and nothing else', async () => {
    const a = owner('playing');
    userStore.setCurrentUser(a);
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    tts.addEventListener.mockImplementation((event: string, handler: (e: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return {remove: () => listeners.get(event)?.delete(handler)};
    });
    tts.speak.mockImplementation(() => Promise.resolve('u-preview'));
    const ticket = preferences.createPreviewTicket(a);
    const handle = (await startVoicePreview(a, ticket)) as PreviewHandle;
    expect(typeof handle).toBe('object');
    expect(tts.speak).toHaveBeenCalledTimes(1);

    await ticket.cancel();
    expect(tts.stop).toHaveBeenCalledTimes(1);
    expect(await handle.result).toBe('stopped');
    // A second Stop (sheet close after Stop) stops nothing more.
    await handle.stop();
    expect(tts.stop).toHaveBeenCalledTimes(1);
  });

  it('a ticket issued for another owner is refused before anything is applied', async () => {
    const a = owner('ticket-a');
    const b = owner('ticket-b');
    userStore.setCurrentUser(a);
    expect(await startVoicePreview(a, preferences.createPreviewTicket(b))).toBe('owner_changed');
    expect(tts.speak).not.toHaveBeenCalled();
  });
});

describe('final audit F1: the check immediately before playback', () => {
  it.each([
    ['owner_changed', 'the account changes'],
    ['microphone_busy', 'dictation takes the microphone'],
  ])('refuses with %s when %s during the last recording check', async (expected, _what) => {
    const a = owner(`last-${expected}`);
    userStore.setCurrentUser(a);
    expect(await initTts()).toBe(true);
    let capture: {captureId: string} | null = null;
    let calls = 0;
    // The first recording check is clean; during the second (the last awaited
    // step before playback) the state changes, then it answers "not recording".
    jest.spyOn(meetingRecorder, 'isRecording').mockImplementation(async () => {
      calls += 1;
      if (calls === 2) {
        if (expected === 'owner_changed') {
          userStore.setCurrentUser(owner('last-other'));
        } else {
          const listening = NativeModules.LafinaSpeechToText.startListening as Mock;
          listening.mockImplementationOnce(() => new Promise(() => undefined));
          capture = startOfflineSpeechCapture({mode: 'manual', bargeIn: false, context: 'main_mic'});
        }
      }
      return false;
    });
    Platform.OS = 'android';
    try {
      const outcome = await startVoicePreview(a);
      await settle();
      expect(calls).toBe(2);
      expect(tts.speak).not.toHaveBeenCalled();
      expect(outcome).toBe(expected);
      await drain(outcome);
    } finally {
      if (capture) await cancelOfflineSpeechCapture((capture as {captureId: string}).captureId);
    }
  });
});
