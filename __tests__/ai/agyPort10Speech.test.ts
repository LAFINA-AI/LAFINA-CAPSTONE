/**
 * AGY-PORT 10: explicit offline voice settings, react-native-tts readiness
 * and owned playback, on the Jest react-native-tts fake (jest.setup.js) and
 * real SQLite. No audible speech, Android engine or cloud service is claimed.
 */
import Tts from 'react-native-tts';
import {db, guestMigration, initDatabase, userStore} from '../../src/storage';
import {
  clampSpeechFactor,
  SPEECH_SETTINGS_KEY,
  speechSettingsStore as speech,
} from '../../src/storage/speechSettingsStore';
import {
  __resetTtsForTests,
  configureTts,
  eligibleOfflineVoices,
  initTts,
  isSpeechBusy,
  isTtsAvailable,
  readTtsReadiness,
  speakTextWithTts,
  startOwnedSpeech,
  stopOwnedSpeech,
  TTS_INIT_TIMEOUT_MS,
} from '../../src/ai/tts/ttsService';
import {applySpeechPreferences, startVoicePreview} from '../../src/ai/tts/speechPreferences';
import * as capture from '../../src/ai/native/speechCapture';
import {meetingRecorder} from '../../src/ai/native/meetingRecorder';

type Mock = jest.Mock;
const tts = Tts as unknown as Record<string, Mock>;
const GUEST = 'local_guest_user';

const VOICES = [
  {id: 'en-us-x-sfg-local', name: 'en-USOffline', language: 'en-US', quality: 400, networkConnectionRequired: false, notInstalled: false},
  {id: 'en-gb-x-gba-local', name: 'en-GBOffline', language: 'en-GB', quality: 400, networkConnectionRequired: false, notInstalled: false},
  {id: 'en-us-x-network', name: 'en-USNetwork', language: 'en-US', quality: 500, networkConnectionRequired: true, notInstalled: false},
  {id: 'en-au-x-pending', name: 'en-AUDownload', language: 'en-AU', quality: 300, networkConnectionRequired: false, notInstalled: true},
  {id: 'en-in-unknown', name: 'en-INUnknown', language: 'en-IN', quality: 300},
  {id: 'en-ca-no-install-flag', name: 'en-CANoFlag', language: 'en-CA', quality: 300, networkConnectionRequired: false},
  {id: 'fil-ph-x-local', name: 'fil-PHOffline', language: 'fil-PH', quality: 300, networkConnectionRequired: false, notInstalled: false},
];

const originals: Record<string, ((...args: unknown[]) => unknown) | undefined> = {};

let serial = 0;
const owner = (label: string): string => {
  serial += 1;
  const id = `p10-${label}-${serial}`;
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR IGNORE INTO users (id, username, email, role, is_new_user, time_format_24h, week_starts_monday, dark_mode, created_at, updated_at)
     VALUES (?, ?, ?, 'student', 0, 0, 0, 0, ?, ?)`,
    [id, id, `${id}@example.invalid`, now, now],
  );
  return id;
};

/** Captures engine listeners so a test can emit events with utterance ids. */
const manualEngine = (ids: string[]) => {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  tts.addEventListener.mockImplementation((event: string, handler: (e: unknown) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(handler);
    return {remove: () => listeners.get(event)?.delete(handler)};
  });
  tts.speak.mockImplementation(() => Promise.resolve(ids.shift() ?? 'u-extra'));
  return {
    emit: (event: string, utteranceId?: string) => {
      for (const handler of [...(listeners.get(event) ?? [])]) {
        handler(utteranceId === undefined ? undefined : {utteranceId});
      }
    },
  };
};

/** Lets the bounded init chain and listener setup run (real timers only). */
const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise(resolve => setImmediate(resolve));
};

beforeAll(async () => {
  await initDatabase();
  for (const key of ['speak', 'addEventListener', 'voices', 'getInitStatus', 'setDefaultLanguage']) {
    originals[key] = tts[key].getMockImplementation();
  }
});

beforeEach(() => {
  __resetTtsForTests();
  for (const key of ['setDefaultRate', 'setDefaultPitch', 'setDefaultVoice', 'stop', 'speak']) {
    tts[key].mockClear();
  }
  tts.voices.mockImplementation(() => Promise.resolve(VOICES));
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  for (const [key, impl] of Object.entries(originals)) tts[key].mockImplementation(impl);
  db.executeSync('DELETE FROM active_session');
});

describe('AGY-PORT 10 saved offline voice settings', () => {
  it('defaults to no explicit choice and saves only valid, current choices', () => {
    const a = owner('settings');
    userStore.setCurrentUser(a);
    expect(speech.read(a)).toMatchObject({revision: 0, explicit: false, voiceId: null, rate: 1, pitch: 1});

    const saved = speech.save(a, {voiceId: 'en-gb-x-gba-local', rate: 1.5, pitch: 0.75}, 0);
    expect(saved).toMatchObject({revision: 1, explicit: true, rate: 1.5, pitch: 0.75});
    for (const bad of [
      {voiceId: null, rate: 0.4, pitch: 1},
      {voiceId: null, rate: 2.1, pitch: 1},
      {voiceId: null, rate: Number.NaN, pitch: 1},
      {voiceId: '', rate: 1, pitch: 1},
      {voiceId: null, rate: 1, pitch: 3},
    ]) {
      expect(() => speech.save(a, bad, saved.revision)).toThrow(/0.5 to 2/);
    }
    expect(() => speech.save(a, {voiceId: null, rate: 1, pitch: 1}, 0)).toThrow(/changed/);

    userStore.setCurrentUser(owner('intruder'));
    expect(() => speech.save(a, {voiceId: null, rate: 1, pitch: 1}, 1)).toThrow(/Account changed/);
    userStore.setCurrentUser(a);

    expect(speech.reset(a, 1)).toMatchObject({revision: 2, explicit: false, voiceId: null, rate: 1, pitch: 1});
    expect(clampSpeechFactor(2.6)).toBe(2);
    expect(clampSpeechFactor(0.333)).toBe(0.5);
    expect(clampSpeechFactor(1.234)).toBe(1.23);
  });

  it('treats a malformed stored choice as unavailable and speaks with the default', async () => {
    const a = owner('settings-bad');
    db.executeSync(
      'INSERT INTO local_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      [a, SPEECH_SETTINGS_KEY, '{"version":1,"revision":1,"explicit":true,"voiceId":null,"rate":9,"pitch":1,"updatedAt":"2026-11-01T00:00:00Z"}', 'x'],
    );
    expect(() => speech.read(a)).toThrow(/unavailable/);
    await applySpeechPreferences(a);
    await initTts();
    expect(tts.setDefaultRate).not.toHaveBeenCalled();
  });

  it('guest link keeps the account’s own choice, moves the guest’s otherwise, and fences the guest', async () => {
    const established = owner('dest');
    userStore.setCurrentUser(established);
    speech.save(established, {voiceId: 'en-gb-x-gba-local', rate: 0.75, pitch: 1}, 0);
    db.executeSync('DELETE FROM local_settings WHERE user_id = ? AND key = ?', [GUEST, SPEECH_SETTINGS_KEY]);
    userStore.setCurrentUser(GUEST);
    speech.save(GUEST, {voiceId: null, rate: 1.75, pitch: 1.25}, 0);

    await guestMigration.linkGuestToCloudAccount(established, `${established}@example.invalid`);
    expect(speech.read(established)).toMatchObject({voiceId: 'en-gb-x-gba-local', rate: 0.75});
    expect(speech.read(GUEST)).toMatchObject({explicit: false, rate: 1});

    const fresh = owner('fresh');
    userStore.setCurrentUser(GUEST);
    speech.save(GUEST, {voiceId: null, rate: 1.5, pitch: 1}, speech.read(GUEST).revision);
    await guestMigration.linkGuestToCloudAccount(fresh, `${fresh}@example.invalid`);
    expect(speech.read(fresh)).toMatchObject({explicit: true, rate: 1.5});
    expect(speech.read(GUEST).explicit).toBe(false);
  });
});

describe('AGY-PORT 10 react-native-tts configuration', () => {
  it('keeps AGY’s default exactly when no choice exists: automatic voice, no rate or pitch call', async () => {
    expect(await initTts()).toBe(true);
    expect(tts.setDefaultVoice).toHaveBeenCalledWith('en-us-x-sfg-local');
    expect(tts.setDefaultRate).not.toHaveBeenCalled();
    expect(tts.setDefaultPitch).not.toHaveBeenCalled();
  });

  it('lists only voices the engine positively reports as installed offline English', () => {
    expect(eligibleOfflineVoices(VOICES).map(v => v.id)).toEqual([
      'en-gb-x-gba-local',
      'en-us-x-sfg-local',
    ]);
    expect(eligibleOfflineVoices(null)).toEqual([]);
  });

  it('applies an explicit choice with the Android rate passed through unchanged', async () => {
    await configureTts({voiceId: 'en-gb-x-gba-local', rate: 1.5, pitch: 0.75});
    expect(tts.setDefaultRate).toHaveBeenCalledWith(1.5, true);
    expect(tts.setDefaultPitch).toHaveBeenCalledWith(0.75);
    expect(tts.setDefaultVoice).toHaveBeenLastCalledWith('en-gb-x-gba-local');
    expect((await readTtsReadiness()).activeVoiceId).toBe('en-gb-x-gba-local');
  });

  it('never selects a network, not-installed or unknown voice; reports it missing and keeps the automatic one', async () => {
    for (const voiceId of ['en-us-x-network', 'en-au-x-pending', 'en-in-unknown', 'en-ca-no-install-flag', 'gone']) {
      __resetTtsForTests();
      tts.setDefaultVoice.mockClear();
      await configureTts({voiceId, rate: 1, pitch: 1});
      expect(tts.setDefaultVoice).not.toHaveBeenCalledWith(voiceId);
      const readiness = await readTtsReadiness();
      expect(readiness.selectedVoiceMissing).toBe(true);
      expect(readiness.activeVoiceId).toBe('en-us-x-sfg-local');
    }
  });

  it('reset undoes a custom choice with neutral values and the automatic voice', async () => {
    await configureTts({voiceId: 'en-gb-x-gba-local', rate: 2, pitch: 2});
    tts.setDefaultRate.mockClear();
    tts.setDefaultPitch.mockClear();
    await configureTts(null);
    expect(tts.setDefaultRate).toHaveBeenCalledWith(1, true);
    expect(tts.setDefaultPitch).toHaveBeenCalledWith(1);
    expect(tts.setDefaultVoice).toHaveBeenLastCalledWith('en-us-x-sfg-local');
  });
});

describe('AGY-PORT 10 readiness', () => {
  it('separates the engine existing from English being ready', async () => {
    expect((await readTtsReadiness())).toMatchObject({service: 'ready', english: 'ready'});

    __resetTtsForTests();
    tts.voices.mockImplementation(() => Promise.resolve([VOICES[2], VOICES[3], VOICES[5]]));
    expect((await readTtsReadiness())).toMatchObject({service: 'ready', english: 'missing', voices: []});

    __resetTtsForTests();
    tts.voices.mockImplementation(() => Promise.resolve([]));
    expect((await readTtsReadiness()).english).toBe('unknown');

    __resetTtsForTests();
    tts.setDefaultLanguage.mockImplementation(() => Promise.reject(new Error('lang_missing')));
    expect((await readTtsReadiness()).english).toBe('missing');

    __resetTtsForTests();
    tts.getInitStatus.mockImplementation(() => Promise.reject(new Error('no_engine')));
    expect(await readTtsReadiness()).toMatchObject({service: 'unavailable', voices: []});
  });

  it('bounds a hung engine start, ignores its late answer and recovers on a later try', async () => {
    jest.useFakeTimers();
    let release: (value: string) => void = () => undefined;
    tts.getInitStatus.mockImplementation(
      () => new Promise<string>(resolve => {
        release = resolve;
      }),
    );
    const first = readTtsReadiness();
    await jest.advanceTimersByTimeAsync(TTS_INIT_TIMEOUT_MS + 1);
    expect(await first).toMatchObject({service: 'timeout'});
    // The engine answers after the bound: that retired attempt cannot mark it ready.
    release('success');
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(isTtsAvailable()).toBe(false);
    jest.useRealTimers();

    tts.getInitStatus.mockImplementation(() => Promise.resolve('success'));
    expect(await initTts()).toBe(true);
  });
});

describe('AGY-PORT 10 owned playback', () => {
  it('a late event for another utterance cannot end this one', async () => {
    const engine = manualEngine(['u-ours']);
    let done = false;
    const speaking = speakTextWithTts('Your reminder').then(() => {
      done = true;
    });
    await flush();
    engine.emit('tts-finish', 'u-old');
    await flush();
    expect(done).toBe(false);
    expect(isSpeechBusy()).toBe(true);
    engine.emit('tts-finish', 'u-ours');
    await speaking;
    expect(done).toBe(true);
    expect(isSpeechBusy()).toBe(false);
  });

  it('an event that arrives before the engine returns the id is matched afterwards', async () => {
    const listeners = new Map<string, (event: unknown) => void>();
    tts.addEventListener.mockImplementation((event: string, handler: (e: unknown) => void) => {
      listeners.set(event, handler);
      return {remove: () => listeners.delete(event)};
    });
    let resolveId: (id: string) => void = () => undefined;
    tts.speak.mockImplementation(() => new Promise<string>(resolve => {
      resolveId = resolve;
    }));
    let done = false;
    const speaking = speakTextWithTts('Early').then(() => {
      done = true;
    });
    await flush();
    listeners.get('tts-finish')?.({utteranceId: 'u-early'});
    await flush();
    expect(done).toBe(false);
    resolveId('u-early');
    await speaking;
    expect(done).toBe(true);
  });

  it('a rejected speak request fails instead of hanging', async () => {
    manualEngine([]);
    tts.speak.mockImplementation(() => Promise.reject(new Error('audio focus denied')));
    await expect(speakTextWithTts('Focus')).rejects.toThrow('audio focus denied');
    expect(isSpeechBusy()).toBe(false);
  });

  it('Stop with a Preview token stops only that Preview, never another session', async () => {
    const engine = manualEngine(['u-app', 'u-preview']);
    const app = speakTextWithTts('Call reminder speaking');
    await flush();
    expect(await stopOwnedSpeech(999)).toBe(false);
    expect(tts.stop).not.toHaveBeenCalled();
    engine.emit('tts-finish', 'u-app');
    await app;

    const preview = startOwnedSpeech('Preview text', 'preview:x');
    const token = await preview.token;
    expect(token).not.toBeNull();
    expect(await stopOwnedSpeech(token!)).toBe(true);
    expect(tts.stop).toHaveBeenCalledTimes(1);
    expect(await preview.result).toBe('stopped');
  });
});

describe('AGY-PORT 10 Preview admission', () => {
  it('refuses while speech, the microphone or a recording is busy, or after an account change', async () => {
    const a = owner('preview');
    userStore.setCurrentUser(a);
    const engine = manualEngine(['u-app', 'u-preview']);

    const app = speakTextWithTts('Busy');
    await flush();
    expect(await startVoicePreview(a)).toBe('speech_busy');
    engine.emit('tts-finish', 'u-app');
    await app;

    const mic = jest.spyOn(capture, 'getActiveOfflineCaptureId').mockReturnValue('capture-1');
    expect(await startVoicePreview(a)).toBe('microphone_busy');
    mic.mockRestore();

    const rec = jest.spyOn(meetingRecorder, 'isRecording').mockResolvedValue(true);
    expect(await startVoicePreview(a)).toBe('recording');
    rec.mockRestore();

    jest.useFakeTimers();
    jest.spyOn(meetingRecorder, 'isRecording').mockReturnValue(new Promise(() => undefined));
    const hung = startVoicePreview(a);
    await jest.advanceTimersByTimeAsync(1501);
    expect(await hung).toBe('recording');
    jest.useRealTimers();
    jest.restoreAllMocks();

    userStore.setCurrentUser(owner('other'));
    expect(await startVoicePreview(a)).toBe('owner_changed');
  });

  it('plays the owner’s saved choice and reports the outcome', async () => {
    const a = owner('preview-play');
    userStore.setCurrentUser(a);
    speech.save(a, {voiceId: 'en-gb-x-gba-local', rate: 1.25, pitch: 1}, 0);
    const engine = manualEngine(['u-preview']);
    const handle = await startVoicePreview(a);
    expect(typeof handle).toBe('object');
    expect(tts.setDefaultRate).toHaveBeenLastCalledWith(1.25, true);
    expect(tts.setDefaultVoice).toHaveBeenLastCalledWith('en-gb-x-gba-local');
    await flush();
    engine.emit('tts-finish', 'u-preview');
    expect(await (handle as {result: Promise<string>}).result).toBe('finished');
  });

  it('applying a signed-out or default owner returns to neutral after a custom choice', async () => {
    const a = owner('apply');
    userStore.setCurrentUser(a);
    speech.save(a, {voiceId: null, rate: 0.5, pitch: 1.5}, 0);
    await applySpeechPreferences(a);
    expect(tts.setDefaultRate).toHaveBeenLastCalledWith(0.5, true);
    await applySpeechPreferences(null);
    expect(tts.setDefaultRate).toHaveBeenLastCalledWith(1, true);
    expect(tts.setDefaultPitch).toHaveBeenLastCalledWith(1);
  });
});
