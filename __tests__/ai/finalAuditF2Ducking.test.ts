/**
 * Final audit F2 (codex-final-audit-940802c-20261106.md): audio ducking is an
 * optional engine setting. A ducking call that never answers or rejects must
 * not hold the shared react-native-tts start open; readiness still needs a
 * voice positively reported as installed and offline. Jest fake only; no real
 * engine hang or audio focus is claimed.
 */
import Tts from 'react-native-tts';
import {
  __resetTtsForTests,
  getSelectedOfflineVoiceId,
  initTts,
  readTtsReadiness,
} from '../../src/ai/tts/ttsService';

type Mock = jest.Mock;
const tts = Tts as unknown as Record<string, Mock | undefined>;

const OFFLINE_US = {id: 'en-us-local', name: 'US', language: 'en-US', quality: 400, networkConnectionRequired: false, notInstalled: false};
const UNKNOWN = {id: 'en-us-unknown', name: 'Unknown', language: 'en-US', quality: 500};

/** The setting bound used by ttsService for optional engine settings. */
const SETTING_BOUND_MS = 3000;

const originalVoices = (tts.voices as Mock).getMockImplementation();

beforeEach(() => {
  __resetTtsForTests();
  (tts.voices as Mock).mockImplementation(() => Promise.resolve([OFFLINE_US]));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete tts.setDucking;
  (tts.voices as Mock).mockImplementation(originalVoices);
});

describe('final audit F2: optional ducking cannot hold speech readiness', () => {
  it('a ducking call that never answers is bounded; callers sharing the start all recover', async () => {
    jest.useFakeTimers();
    tts.setDucking = jest.fn(() => new Promise(() => undefined));
    const first = initTts();
    const second = initTts();
    const readiness = readTtsReadiness();
    await jest.advanceTimersByTimeAsync(SETTING_BOUND_MS + 1);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(await readiness).toMatchObject({service: 'ready', english: 'ready', activeVoiceId: 'en-us-local'});
    expect(tts.setDucking).toHaveBeenCalledTimes(1);
    expect(tts.setDucking).toHaveBeenCalledWith(true);
  });

  it('a rejected ducking call is ignored and the engine still becomes ready', async () => {
    tts.setDucking = jest.fn(() => Promise.reject(new Error('ducking unsupported')));
    expect(await initTts()).toBe(true);
    expect(getSelectedOfflineVoiceId()).toBe('en-us-local');
  });

  it('after a hung ducking start, a later initialization with working ducking succeeds', async () => {
    jest.useFakeTimers();
    tts.setDucking = jest.fn(() => new Promise(() => undefined));
    const hung = initTts();
    await jest.advanceTimersByTimeAsync(SETTING_BOUND_MS + 1);
    expect(await hung).toBe(true);
    jest.useRealTimers();

    __resetTtsForTests();
    tts.setDucking = jest.fn(() => Promise.resolve());
    expect(await initTts()).toBe(true);
    expect(tts.setDucking).toHaveBeenCalledTimes(1);
    expect(await readTtsReadiness()).toMatchObject({service: 'ready', english: 'ready'});
  });

  it('a hung ducking call never makes an unknown voice count as offline', async () => {
    jest.useFakeTimers();
    (tts.voices as Mock).mockImplementation(() => Promise.resolve([UNKNOWN]));
    tts.setDucking = jest.fn(() => new Promise(() => undefined));
    const started = initTts();
    await jest.advanceTimersByTimeAsync(SETTING_BOUND_MS + 1);
    expect(await started).toBe(false);
    expect(getSelectedOfflineVoiceId()).toBeNull();
  });
});
