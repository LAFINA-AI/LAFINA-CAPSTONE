/**
 * Codex audit A1 (codex-audit-20261106-phase11.md): every local playback path
 * needs an installed, offline English voice that the engine positively reports
 * and accepted. Unknown metadata, a failed voice list or a failed selection
 * means local speech reports unavailable (text recovery), never an arbitrary
 * engine default. Jest react-native-tts fake only; no audio or network claim.
 */
import Tts from 'react-native-tts';
import {
  __resetTtsForTests,
  configureTts,
  getSelectedOfflineVoiceId,
  initTts,
  isTtsAvailable,
  readTtsReadiness,
  selectOfflineVoice,
  speakTextWithTts,
  startOwnedSpeech,
} from '../../src/ai/tts/ttsService';

type Mock = jest.Mock;
const tts = Tts as unknown as Record<string, Mock>;

const OFFLINE_US = {id: 'en-us-local', name: 'US', language: 'en-US', quality: 400, networkConnectionRequired: false, notInstalled: false};
const OFFLINE_GB = {id: 'en-gb-local', name: 'GB', language: 'en-GB', quality: 400, networkConnectionRequired: false, notInstalled: false};
const NO_FLAGS = {id: 'en-us-unknown', name: 'Unknown', language: 'en-US', quality: 500};
const NO_INSTALL_FLAG = {id: 'en-us-half', name: 'Half', language: 'en-US', quality: 500, networkConnectionRequired: false};
const NETWORK = {id: 'en-us-net', name: 'Net', language: 'en-US', quality: 500, networkConnectionRequired: true, notInstalled: false};

const originals: Record<string, ((...args: unknown[]) => unknown) | undefined> = {};

beforeAll(() => {
  for (const key of ['voices', 'setDefaultVoice', 'speak']) {
    originals[key] = tts[key].getMockImplementation();
  }
});

beforeEach(() => {
  __resetTtsForTests();
  for (const key of ['setDefaultVoice', 'speak', 'setDefaultRate', 'setDefaultPitch']) tts[key].mockClear();
});

afterEach(() => {
  for (const [key, impl] of Object.entries(originals)) tts[key].mockImplementation(impl);
});

const offer = (voices: unknown) => tts.voices.mockImplementation(() => Promise.resolve(voices));

describe('codex audit A1: automatic voice needs positive offline metadata', () => {
  it('never picks a voice with missing metadata, even when it is the best quality', () => {
    expect(selectOfflineVoice([NO_FLAGS, NO_INSTALL_FLAG, NETWORK] as never)).toBeNull();
    expect(selectOfflineVoice([NO_FLAGS, OFFLINE_GB, NO_INSTALL_FLAG] as never)?.id).toBe('en-gb-local');
  });

  it('only unknown or network voices: engine ready, local speech off, nothing spoken', async () => {
    offer([NO_FLAGS, NO_INSTALL_FLAG, NETWORK]);
    expect(await initTts()).toBe(false);
    expect(isTtsAvailable()).toBe(false);
    expect(tts.setDefaultVoice).not.toHaveBeenCalled();
    await expect(speakTextWithTts('Reminder')).rejects.toThrow(/unavailable/);
    expect(tts.speak).not.toHaveBeenCalled();
    expect(await readTtsReadiness()).toMatchObject({service: 'ready', english: 'missing', activeVoiceId: null});
  });

  it('a failed voice list is unknown capability: unavailable, not the engine default', async () => {
    tts.voices.mockImplementation(() => Promise.reject(new Error('engine threw while listing')));
    expect(await initTts()).toBe(false);
    expect((await startOwnedSpeech('Preview', 'preview:a1').result)).toBe('failed');
    expect(tts.speak).not.toHaveBeenCalled();
    expect(await readTtsReadiness()).toMatchObject({service: 'ready', english: 'unknown', activeVoiceId: null});
  });

  it('a failed voice selection is not confirmed: listed but unconfirmed, nothing spoken', async () => {
    offer([OFFLINE_US]);
    tts.setDefaultVoice.mockImplementation(() => Promise.reject(new Error('voice refused')));
    expect(await initTts()).toBe(false);
    await expect(speakTextWithTts('Reminder')).rejects.toThrow(/unavailable/);
    expect(tts.speak).not.toHaveBeenCalled();
    expect(await readTtsReadiness()).toMatchObject({english: 'unconfirmed', activeVoiceId: null});
  });

  it('recovers on a later call once an offline voice is listed and accepted', async () => {
    offer([NO_FLAGS]);
    expect(await initTts()).toBe(false);
    offer([NO_FLAGS, OFFLINE_US]);
    expect(await initTts()).toBe(true);
    expect(getSelectedOfflineVoiceId()).toBe('en-us-local');
    await speakTextWithTts('Now it speaks');
    expect(tts.speak).toHaveBeenCalledTimes(1);
  });
});

describe('codex audit A1: explicit choice, removal and reset keep the offline guarantee', () => {
  it('a removed explicit voice falls back to the automatic offline voice', async () => {
    offer([OFFLINE_US, OFFLINE_GB]);
    await configureTts({voiceId: 'en-gb-local', rate: 1, pitch: 1});
    expect((await readTtsReadiness()).activeVoiceId).toBe('en-gb-local');
    offer([OFFLINE_US]);
    const readiness = await readTtsReadiness();
    expect(readiness).toMatchObject({english: 'ready', activeVoiceId: 'en-us-local', selectedVoiceMissing: true});
    expect(tts.setDefaultVoice).toHaveBeenLastCalledWith('en-us-local');
  });

  it('a removed explicit voice with no other offline voice turns local speech off', async () => {
    offer([OFFLINE_GB]);
    await configureTts({voiceId: 'en-gb-local', rate: 1.25, pitch: 1});
    expect(await initTts()).toBe(true);
    offer([NO_FLAGS]);
    expect(await readTtsReadiness()).toMatchObject({english: 'missing', activeVoiceId: null, selectedVoiceMissing: true});
    await expect(speakTextWithTts('Reminder')).rejects.toThrow(/unavailable/);
    expect(tts.speak).not.toHaveBeenCalled();
  });

  it('with no explicit choice, a removed automatic voice turns local speech off', async () => {
    offer([OFFLINE_US]);
    expect(await initTts()).toBe(true);
    offer([NO_FLAGS]);
    expect(await readTtsReadiness()).toMatchObject({english: 'missing', activeVoiceId: null});
    expect(isTtsAvailable()).toBe(false);
    await expect(speakTextWithTts('Reminder')).rejects.toThrow(/unavailable/);
  });

  it('reset after the automatic voice disappeared does not trust the engine default', async () => {
    offer([OFFLINE_GB]);
    await configureTts({voiceId: 'en-gb-local', rate: 2, pitch: 1});
    expect(await initTts()).toBe(true);
    offer([NO_FLAGS, NETWORK]);
    await configureTts(null);
    expect(tts.setDefaultRate).toHaveBeenLastCalledWith(1, true);
    expect(isTtsAvailable()).toBe(false);
    await expect(speakTextWithTts('Reminder')).rejects.toThrow(/unavailable/);
  });

  it('reset returns to the automatic offline voice when one is listed', async () => {
    offer([OFFLINE_US, OFFLINE_GB]);
    await configureTts({voiceId: 'en-gb-local', rate: 2, pitch: 1});
    await configureTts(null);
    expect(tts.setDefaultVoice).toHaveBeenLastCalledWith('en-us-local');
    expect(await initTts()).toBe(true);
    expect(getSelectedOfflineVoiceId()).toBe('en-us-local');
  });

  it('a failed explicit selection does not leave an unconfirmed voice in use', async () => {
    offer([OFFLINE_US, OFFLINE_GB]);
    expect(await initTts()).toBe(true);
    tts.setDefaultVoice.mockImplementation((id: string) =>
      id === 'en-gb-local' ? Promise.reject(new Error('refused')) : Promise.resolve(),
    );
    await configureTts({voiceId: 'en-gb-local', rate: 1, pitch: 1});
    const readiness = await readTtsReadiness();
    expect(readiness).toMatchObject({english: 'ready', activeVoiceId: 'en-us-local', selectedVoiceMissing: true});
    expect(tts.setDefaultVoice).toHaveBeenLastCalledWith('en-us-local');
  });
});
